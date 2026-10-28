import { Router } from 'express'
import { query, withTx } from '../db.js'
import { isStaff, requireStaff } from '../auth.js'
import { HttpError, posInt, str, wrap } from '../util.js'
import { RESERVED, TOTAL_STOCK } from '../stock.js'

export const requestsRouter = Router()

const KINDS = ['sale', 'process', 'buyback']
const FLAG = { sale: 'in_sale', process: 'in_process', buyback: 'in_buyback' }
const LABEL = { sale: 'Penjualan', process: 'Pemrosesan', buyback: 'Jual Barang' }
const MAX_LINES = 50
const STATUSES = ['pending', 'approved', 'reported', 'completed', 'rejected', 'cancelled']

function parseLines(raw, empty = 'Pilih minimal satu barang') {
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, empty)
  if (raw.length > MAX_LINES) throw new HttpError(400, `Maksimal ${MAX_LINES} jenis barang`)
  const merged = new Map()
  for (const l of raw) {
    const id = posInt(l?.item_id, 'Barang')
    merged.set(id, (merged.get(id) ?? 0) + posInt(l?.qty, 'Jumlah'))
  }
  return [...merged.entries()].map(([item_id, qty]) => ({ item_id, qty })).sort((a, b) => a.item_id - b.item_id)
}

async function lockRequest(conn, id) {
  const [[request]] = await conn.query('SELECT * FROM requests WHERE id = ? FOR UPDATE', [id])
  if (!request) throw new HttpError(404, 'Pengajuan tidak ditemukan')
  return request
}

async function lockItems(conn, itemIds) {
  const [rows] = await conn.query(
    'SELECT id FROM items WHERE id IN (?) AND deleted_at IS NULL ORDER BY id FOR UPDATE',
    [itemIds],
  )
  if (rows.length !== itemIds.length) throw new HttpError(409, 'Ada barang di pengajuan yang sudah dihapus')
}

const writeLog = (conn, user, request, { item_id, location_id, type, qty, note, refType }) =>
  conn.query(
    `INSERT INTO inventory_logs (item_id, location_id, type, qty, note, user_id, user_name, ref_type, ref_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [item_id, location_id, type, qty, note, user.id, user.name, refType, request.id],
  )

// Staff/admin tidak boleh memproses pengajuannya sendiri (kecuali admin).
function assertNotSelf(user, request, action) {
  if (request.user_id === user.id && user.role !== 'admin')
    throw new HttpError(403, `Tidak boleh ${action} pengajuan sendiri`)
}

/* ---------- Pilihan barang untuk membuat pengajuan ---------- */

requestsRouter.get(
  '/options',
  wrap(async (req, res) => {
    const kind = req.query.kind
    if (!KINDS.includes(kind)) throw new HttpError(400, 'Jenis pengajuan tidak valid')
    const items = await query(
      `SELECT i.id, i.name, i.category, i.unit, i.image_url,
              ${kind === 'sale' ? 'i.min_sale_qty' : '1'} AS min_qty,
              ${kind === 'buyback' ? 'i.buyback_price' : '0'} AS price,
              GREATEST(${TOTAL_STOCK} - ${RESERVED}, 0) AS available
         FROM items i
        WHERE i.deleted_at IS NULL AND i.${FLAG[kind]} = 1 ${kind === 'buyback' ? 'AND i.buyback_price > 0' : ''}
        ORDER BY i.category, i.name`,
    )
    // Item hasil pemrosesan boleh barang apa saja di katalog.
    const resultItems =
      kind === 'process'
        ? await query(
            'SELECT id, name, category, unit, image_url FROM items WHERE deleted_at IS NULL ORDER BY name',
          )
        : []
    res.json({
      items: items.map((r) => ({
        ...r,
        min_qty: Number(r.min_qty),
        price: Number(r.price),
        available: Number(r.available),
      })),
      resultItems,
    })
  }),
)

/* ---------- Buat pengajuan ---------- */

requestsRouter.post(
  '/',
  wrap(async (req, res) => {
    const kind = req.body?.kind
    if (!KINDS.includes(kind)) throw new HttpError(400, 'Jenis pengajuan tidak valid')
    const lines = parseLines(req.body?.lines)

    const id = await withTx(async (conn) => {
      const [items] = await conn.query(
        `SELECT id, name, image_url, in_sale, in_process, in_buyback, buyback_price, min_sale_qty FROM items
          WHERE id IN (?) AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
        [lines.map((l) => l.item_id)],
      )
      const byId = new Map(items.map((i) => [i.id, i]))
      for (const l of lines) {
        const item = byId.get(l.item_id)
        if (!item) throw new HttpError(409, 'Ada barang yang tidak ditemukan')
        if (!item[FLAG[kind]]) throw new HttpError(409, `"${item.name}" tidak bisa diajukan untuk ${LABEL[kind]}`)
        const min = kind === 'sale' ? Number(item.min_sale_qty) : 1
        if (l.qty < min) throw new HttpError(400, `Minimal ${min} untuk "${item.name}"`)
        if (kind === 'buyback') {
          // Barang berasal dari member, jadi tidak ada batas stok; harga beli dari katalog.
          if (Number(item.buyback_price) <= 0) throw new HttpError(409, `Harga beli "${item.name}" belum diatur`)
          continue
        }
        const [[{ available }]] = await conn.query(
          `SELECT ${TOTAL_STOCK} - ${RESERVED} AS available FROM items i WHERE i.id = ?`,
          [l.item_id],
        )
        if (l.qty > Number(available))
          throw new HttpError(
            409,
            `Stok "${item.name}" tidak cukup (tersedia ${Math.max(Number(available), 0)})`,
          )
      }

      const priceOf = (itemId) => (kind === 'buyback' ? Number(byId.get(itemId).buyback_price) : 0)
      const total = lines.reduce((sum, l) => sum + priceOf(l.item_id) * l.qty, 0)

      const [r] = await conn.query('INSERT INTO requests (kind, user_id, user_name, total) VALUES (?, ?, ?, ?)', [
        kind,
        req.user.id,
        req.user.name,
        total,
      ])
      await conn.query(
        `INSERT INTO request_items (request_id, role, item_id, item_name, image_url, qty, price) VALUES ?`,
        [
          lines.map((l) => {
            const item = byId.get(l.item_id)
            return [r.insertId, 'input', l.item_id, item.name, item.image_url, l.qty, priceOf(l.item_id)]
          }),
        ],
      )
      return r.insertId
    })

    res.status(201).json({ id })
  }),
)

/* ---------- Daftar ---------- */

requestsRouter.get(
  '/',
  wrap(async (req, res) => {
    const where = []
    const params = []
    if (KINDS.includes(req.query.kind)) {
      where.push('r.kind = ?')
      params.push(req.query.kind)
    }
    if (!isStaff(req.user)) {
      where.push('r.user_id = ?')
      params.push(req.user.id)
    }
    // "open" = yang masih butuh tindakan staff: menunggu persetujuan atau sudah dilaporkan.
    if (req.query.status === 'open') where.push(`r.status IN ('pending', 'reported')`)
    else if (STATUSES.includes(req.query.status)) {
      where.push('r.status = ?')
      params.push(req.query.status)
    }
    const rows = await query(
      `SELECT r.* FROM requests r ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY r.id DESC LIMIT 200`,
      params,
    )
    if (rows.length === 0) return res.json([])

    const lines = await query(
      `SELECT request_id, role, item_id, item_name, image_url, qty, price
         FROM request_items WHERE request_id IN (?) ORDER BY id`,
      [rows.map((r) => r.id)],
    )
    const byRequest = new Map()
    for (const l of lines) byRequest.set(l.request_id, [...(byRequest.get(l.request_id) ?? []), l])
    res.json(
      rows.map((r) => ({
        ...r,
        result_money: r.result_money === null ? null : Number(r.result_money),
        total: Number(r.total),
        items: (byRequest.get(r.id) ?? []).map((l) => ({ ...l, price: Number(l.price) })),
      })),
    )
  }),
)

/* ---------- Tindakan ---------- */

requestsRouter.post(
  '/:id/cancel',
  wrap(async (req, res) => {
    await withTx(async (conn) => {
      const request = await lockRequest(conn, req.params.id)
      if (!isStaff(req.user) && request.user_id !== req.user.id)
        throw new HttpError(404, 'Pengajuan tidak ditemukan')
      if (request.status !== 'pending') throw new HttpError(409, 'Hanya pengajuan yang menunggu yang bisa dibatalkan')
      await conn.query(`UPDATE requests SET status = 'cancelled' WHERE id = ?`, [request.id])
    })
    res.json({ ok: true })
  }),
)

// Disetujui: bahan keluar dari stok (lokasi dengan stok terbanyak dulu) dan dicatat di Riwayat.
requestsRouter.post(
  '/:id/approve',
  requireStaff,
  wrap(async (req, res) => {
    const note = str(req.body?.note, { field: 'Catatan', max: 500 })
    await withTx(async (conn) => {
      const request = await lockRequest(conn, req.params.id)
      if (request.status !== 'pending') throw new HttpError(409, 'Pengajuan sudah diproses')
      assertNotSelf(req.user, request, 'menyetujui')

      const [lines] = await conn.query(
        `SELECT item_id, item_name, qty FROM request_items
          WHERE request_id = ? AND role = 'input' ORDER BY item_id`,
        [request.id],
      )
      await lockItems(conn, lines.map((l) => l.item_id))

      if (request.kind === 'buyback') {
        // Barang dari member masuk ke lokasi "Dijual di Market" (toko); pengajuan langsung selesai.
        const [[store]] = await conn.query(
          `SELECT id FROM locations WHERE sell_in_market = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1`,
        )
        if (!store) throw new HttpError(409, 'Tandai satu lokasi sebagai "Dijual di Market" dulu (lokasi toko)')
        for (const line of lines) {
          await writeLog(conn, req.user, request, {
            item_id: line.item_id,
            location_id: store.id,
            type: 'in',
            qty: line.qty,
            note: `Jual barang #${request.id} · ${request.user_name}`,
            refType: 'request',
          })
        }
        await conn.query(
          `UPDATE requests SET status = 'completed', review_note = ?, reviewed_by_name = ?, reviewed_at = NOW(),
                  completed_at = NOW(), confirmed_by_name = ? WHERE id = ?`,
          [note, req.user.name, req.user.name, request.id],
        )
        return
      }

      for (const line of lines) {
        const [locs] = await conn.query(
          `SELECT s.location_id, s.qty FROM stock_levels s
             JOIN locations l ON l.id = s.location_id AND l.deleted_at IS NULL
            WHERE s.item_id = ? AND s.qty > 0
            ORDER BY s.qty DESC, s.location_id`,
          [line.item_id],
        )
        let left = line.qty
        for (const loc of locs) {
          if (left === 0) break
          const take = Math.min(left, Number(loc.qty))
          await writeLog(conn, req.user, request, {
            item_id: line.item_id,
            location_id: loc.location_id,
            type: 'out',
            qty: take,
            note: `${LABEL[request.kind]} #${request.id} · ${request.user_name}`,
            refType: 'request',
          })
          left -= take
        }
        if (left > 0) throw new HttpError(409, `Stok "${line.item_name}" tidak cukup (kurang ${left})`)
      }

      await conn.query(
        `UPDATE requests SET status = 'approved', review_note = ?, reviewed_by_name = ?, reviewed_at = NOW()
          WHERE id = ?`,
        [note, req.user.name, request.id],
      )
    })
    res.json({ ok: true })
  }),
)

requestsRouter.post(
  '/:id/reject',
  requireStaff,
  wrap(async (req, res) => {
    const note = str(req.body?.note, { field: 'Alasan', max: 500 })
    await withTx(async (conn) => {
      const request = await lockRequest(conn, req.params.id)
      if (request.status !== 'pending') throw new HttpError(409, 'Pengajuan sudah diproses')
      await conn.query(
        `UPDATE requests SET status = 'rejected', review_note = ?, reviewed_by_name = ?, reviewed_at = NOW()
          WHERE id = ?`,
        [note, req.user.name, request.id],
      )
    })
    res.json({ ok: true })
  }),
)

// Member melapor: Penjualan = uang hasil + bukti; Pemrosesan = item hasil + bukti.
requestsRouter.post(
  '/:id/report',
  wrap(async (req, res) => {
    const proof = String(req.body?.proof ?? '').trim()
    if (!/^https?:\/\/\S+$/i.test(proof) || proof.length > 500)
      throw new HttpError(400, 'Link bukti harus berupa URL http(s)')

    await withTx(async (conn) => {
      const request = await lockRequest(conn, req.params.id)
      if (request.user_id !== req.user.id) throw new HttpError(404, 'Pengajuan tidak ditemukan')
      if (request.status !== 'approved')
        throw new HttpError(409, 'Pengajuan belum disetujui atau sudah dilaporkan')

      let money = null
      if (request.kind === 'sale') {
        money = posInt(req.body?.money, 'Jumlah uang')
      } else {
        const results = parseLines(req.body?.results, 'Isi item hasil pemrosesan')
        const [items] = await conn.query(
          'SELECT id, name, image_url FROM items WHERE id IN (?) AND deleted_at IS NULL',
          [results.map((r) => r.item_id)],
        )
        const byId = new Map(items.map((i) => [i.id, i]))
        if (byId.size !== results.length) throw new HttpError(409, 'Ada item hasil yang tidak ditemukan')
        await conn.query(
          'INSERT INTO request_items (request_id, role, item_id, item_name, image_url, qty) VALUES ?',
          [
            results.map((r) => {
              const item = byId.get(r.item_id)
              return [request.id, 'result', r.item_id, item.name, item.image_url, r.qty]
            }),
          ],
        )
      }

      await conn.query(
        `UPDATE requests SET status = 'reported', result_money = ?, proof_url = ?, reported_at = NOW()
          WHERE id = ?`,
        [money, proof, request.id],
      )
    })
    res.json({ ok: true })
  }),
)

// Staff mengonfirmasi laporan. Pemrosesan: item hasil masuk ke lokasi "Dijual di Market".
requestsRouter.post(
  '/:id/confirm',
  requireStaff,
  wrap(async (req, res) => {
    await withTx(async (conn) => {
      const request = await lockRequest(conn, req.params.id)
      if (request.status !== 'reported') throw new HttpError(409, 'Belum ada laporan untuk dikonfirmasi')
      assertNotSelf(req.user, request, 'mengonfirmasi laporan')

      if (request.kind === 'process') {
        const [[store]] = await conn.query(
          `SELECT id FROM locations WHERE sell_in_market = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1`,
        )
        if (!store)
          throw new HttpError(409, 'Tandai satu lokasi sebagai "Dijual di Market" dulu (tujuan hasil pemrosesan)')
        const [results] = await conn.query(
          `SELECT item_id, qty FROM request_items WHERE request_id = ? AND role = 'result' ORDER BY item_id`,
          [request.id],
        )
        await lockItems(conn, [...new Set(results.map((r) => r.item_id))])
        for (const r of results) {
          await writeLog(conn, req.user, request, {
            item_id: r.item_id,
            location_id: store.id,
            type: 'in',
            qty: r.qty,
            note: `Hasil pemrosesan #${request.id} · ${request.user_name}`,
            refType: 'request_result',
          })
        }
      }

      await conn.query(
        `UPDATE requests SET status = 'completed', completed_at = NOW(), confirmed_by_name = ? WHERE id = ?`,
        [req.user.name, request.id],
      )
    })
    res.json({ ok: true })
  }),
)

// Staff mengembalikan laporan yang tidak valid agar member melapor ulang.
requestsRouter.post(
  '/:id/reopen',
  requireStaff,
  wrap(async (req, res) => {
    const note = str(req.body?.note, { field: 'Alasan', max: 500 })
    await withTx(async (conn) => {
      const request = await lockRequest(conn, req.params.id)
      if (request.status !== 'reported') throw new HttpError(409, 'Tidak ada laporan untuk dikembalikan')
      await conn.query(`DELETE FROM request_items WHERE request_id = ? AND role = 'result'`, [request.id])
      await conn.query(
        `UPDATE requests SET status = 'approved', result_money = NULL, proof_url = NULL,
                reported_at = NULL, review_note = ? WHERE id = ?`,
        [note, request.id],
      )
    })
    res.json({ ok: true })
  }),
)
