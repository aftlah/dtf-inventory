import { Router } from 'express'
import { query } from '../db.js'
import { requireAdmin } from '../auth.js'
import { audit } from '../audit.js'
import { HttpError, posInt, str, wrap } from '../util.js'

// Buku kas. Router ini hanya dipasang untuk admin/staff.
export const cashRouter = Router()

const WASH = ['dirty', 'washing', 'clean']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Tanggal hari ini menurut WIB (UTC+7).
const todayWib = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)

function parseDate(value, field) {
  if (value === undefined || value === null || value === '') return null
  const v = String(value)
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(v))) throw new HttpError(400, `${field} tidak valid`)
  return v
}

// Filter periode (inklusif) untuk kolom entry_date.
function periodWhere(req) {
  const from = parseDate(req.query.from, 'Tanggal awal')
  const to = parseDate(req.query.to, 'Tanggal akhir')
  const where = ['deleted_at IS NULL']
  const params = []
  if (from) {
    where.push('entry_date >= ?')
    params.push(from)
  }
  if (to) {
    where.push('entry_date <= ?')
    params.push(to)
  }
  return { where, params }
}

cashRouter.get(
  '/summary',
  wrap(async (req, res) => {
    const { where, params } = periodWhere(req)
    const clause = where.join(' AND ')

    const [totals] = await query(
      `SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount END), 0) AS income,
              COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expense
         FROM cash_entries WHERE ${clause}`,
      params,
    )
    // Posisi uang kotor/dicuci/bersih selalu dihitung dari semua pemasukan, bukan hanya periode terpilih.
    const [pools] = await query(
      `SELECT COALESCE(SUM(CASE WHEN wash_status = 'dirty' THEN amount END), 0) AS dirty,
              COALESCE(SUM(CASE WHEN wash_status = 'washing' THEN amount END), 0) AS washing,
              COALESCE(SUM(CASE WHEN wash_status = 'clean' THEN amount END), 0) AS clean
         FROM cash_entries WHERE deleted_at IS NULL AND type = 'income'`,
    )
    const byCategory = (type) =>
      query(
        `SELECT category, SUM(amount) AS amount, COUNT(*) AS count
           FROM cash_entries WHERE ${clause} AND type = ?
          GROUP BY category ORDER BY SUM(amount) DESC`,
        [...params, type],
      ).then((rows) => rows.map((r) => ({ category: r.category, amount: Number(r.amount), count: Number(r.count) })))

    const income = Number(totals.income)
    const expense = Number(totals.expense)
    res.json({
      income,
      expense,
      balance: income - expense,
      pools: { dirty: Number(pools.dirty), washing: Number(pools.washing), clean: Number(pools.clean) },
      expense_by_category: await byCategory('expense'),
      income_by_category: await byCategory('income'),
    })
  }),
)

cashRouter.get(
  '/entries',
  wrap(async (req, res) => {
    const { where, params } = periodWhere(req)
    if (['income', 'expense'].includes(req.query.type)) {
      where.push('type = ?')
      params.push(req.query.type)
    }
    const limit = Math.min(Number(req.query.limit) || 300, 500)
    const rows = await query(
      `SELECT id, DATE_FORMAT(entry_date, '%Y-%m-%d') AS entry_date, type, category, amount,
              counterparty, note, wash_status, created_by_name
         FROM cash_entries WHERE ${where.join(' AND ')}
        ORDER BY entry_date DESC, id DESC LIMIT ?`,
      [...params, limit],
    )
    res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })))
  }),
)

cashRouter.post(
  '/entries',
  wrap(async (req, res) => {
    const b = req.body ?? {}
    if (!['income', 'expense'].includes(b.type)) throw new HttpError(400, 'Jenis tidak valid')
    const category = str(b.category, { field: 'Kategori', max: 60, required: true })
    const amount = posInt(b.amount, 'Nominal')
    const counterparty = str(b.counterparty, { field: 'Sumber/tujuan', max: 120 })
    const note = str(b.note, { field: 'Catatan', max: 500 })
    const date = parseDate(b.date, 'Tanggal') ?? todayWib()

    let wash = null
    if (b.type === 'income') {
      wash = b.wash_status ?? 'dirty'
      if (!WASH.includes(wash)) throw new HttpError(400, 'Status uang tidak valid')
    }

    const r = await query(
      `INSERT INTO cash_entries (entry_date, type, category, amount, counterparty, note, wash_status, washed_at,
                                 created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        date,
        b.type,
        category,
        amount,
        counterparty,
        note,
        wash,
        wash === 'clean' ? new Date() : null,
        req.user.id,
        req.user.name,
      ],
    )
    await audit(req.user, {
      entity: 'cash',
      id: r.insertId,
      label: `${b.type === 'income' ? 'Pemasukan' : 'Pengeluaran'} ${category}`,
      action: 'create',
      after: { jenis: b.type, kategori: category, nominal: amount, sumber_tujuan: counterparty, tanggal: date },
    })
    res.status(201).json({ id: r.insertId })
  }),
)

// Ubah status uang pemasukan: kotor -> sedang dicuci -> bersih.
cashRouter.post(
  '/entries/:id/wash',
  wrap(async (req, res) => {
    const status = req.body?.status
    if (!WASH.includes(status)) throw new HttpError(400, 'Status uang tidak valid')
    const r = await query(
      `UPDATE cash_entries SET wash_status = ?, washed_at = ?
        WHERE id = ? AND type = 'income' AND deleted_at IS NULL`,
      [status, status === 'clean' ? new Date() : null, req.params.id],
    )
    if (!r.affectedRows) throw new HttpError(404, 'Catatan pemasukan tidak ditemukan')
    await audit(req.user, { entity: 'cash', id: Number(req.params.id), label: `Pemasukan #${req.params.id}`, action: 'wash_status', details: { status } })
    res.json({ ok: true })
  }),
)

cashRouter.delete(
  '/entries/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const r = await query('UPDATE cash_entries SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [
      req.params.id,
    ])
    if (!r.affectedRows) throw new HttpError(404, 'Catatan tidak ditemukan')
    await audit(req.user, { entity: 'cash', id: Number(req.params.id), label: `Catatan kas #${req.params.id}`, action: 'delete' })
    res.json({ ok: true })
  }),
)
