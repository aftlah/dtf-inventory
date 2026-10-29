import { Router } from 'express'
import { query, withTx } from '../db.js'
import { isStaff, requireStaff } from '../auth.js'
import { HttpError, posInt, str, wrap } from '../util.js'
import { MARKET_STOCK, RESERVED } from '../stock.js'
import { audit } from '../audit.js'
import { formatUsd, notifyLowStock, notifyStaff, notifyUsers, summarizeItems } from '../notify.js'

export const marketRouter = Router()
export const ordersRouter = Router()

// Stok tersedia di Market = stok lokasi "Dijual di Market" dikurangi yang sudah dipesan
// (pesanan Market dan pengajuan yang masih menunggu).

const MAX_LINES = 50

// Batas beli per pesanan menurut role pembeli. Staff/admin tanpa batas; NULL di kolom = tanpa batas.
const LIMIT_COLUMN = { member: 'max_buy_member', highrank: 'max_buy_highrank' }
const buyLimit = (user, item) => {
  const column = LIMIT_COLUMN[user.role]
  return column && item[column] != null ? Number(item[column]) : null
}

/* ---------- Market: daftar barang ---------- */

marketRouter.get(
  '/items',
  wrap(async (req, res) => {
    const rows = await query(
      `SELECT i.id, i.name, i.category, i.unit, i.price, i.image_url, i.max_buy_member, i.max_buy_highrank,
              GREATEST(${MARKET_STOCK} - ${RESERVED}, 0) AS available
         FROM items i
        WHERE i.deleted_at IS NULL AND i.in_market = 1 AND i.price > 0
        ORDER BY i.category, i.name`,
    )
    res.json(
      rows.map(({ max_buy_member, max_buy_highrank, ...r }) => ({
        ...r,
        price: Number(r.price),
        available: Number(r.available),
        max_buy: buyLimit(req.user, { max_buy_member, max_buy_highrank }),
      })),
    )
  }),
)

/* ---------- Pesanan ---------- */

function parseLines(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new HttpError(400, 'Keranjang kosong')
  if (raw.length > MAX_LINES) throw new HttpError(400, `Maksimal ${MAX_LINES} jenis barang per pesanan`)
  const merged = new Map()
  for (const l of raw) {
    const id = posInt(l?.item_id, 'Barang')
    merged.set(id, (merged.get(id) ?? 0) + posInt(l?.qty, 'Jumlah'))
  }
  return [...merged.entries()].map(([item_id, qty]) => ({ item_id, qty })).sort((a, b) => a.item_id - b.item_id)
}

ordersRouter.post(
  '/',
  wrap(async (req, res) => {
    const lines = parseLines(req.body?.lines)
    const note = str(req.body?.note, { field: 'Catatan', max: 500 })

    const orderId = await withTx(async (conn) => {
      // Kunci baris barang (berurutan menurut id) agar dua pesanan tidak menjual stok yang sama.
      const [items] = await conn.query(
        `SELECT id, name, price, cost_price, image_url, in_market, max_buy_member, max_buy_highrank FROM items
          WHERE id IN (?) AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
        [lines.map((l) => l.item_id)],
      )
      const byId = new Map(items.map((i) => [i.id, i]))
      let total = 0
      for (const l of lines) {
        const item = byId.get(l.item_id)
        if (!item || !item.in_market || Number(item.price) <= 0)
          throw new HttpError(409, 'Ada barang yang tidak dijual lagi')
        const limit = buyLimit(req.user, item)
        if (limit !== null && l.qty > limit)
          throw new HttpError(409, `Maksimal pembelian "${item.name}" adalah ${limit} per pesanan`)
        const [[{ available }]] = await conn.query(
          `SELECT ${MARKET_STOCK} - ${RESERVED} AS available FROM items i WHERE i.id = ?`,
          [l.item_id],
        )
        if (l.qty > Number(available))
          throw new HttpError(
            409,
            `Stok "${item.name}" tidak cukup (tersedia ${Math.max(Number(available), 0)})`,
          )
        total += Number(item.price) * l.qty
      }

      // Pesanan Market tidak perlu disetujui: langsung aktif (belum dibayar) dan stok langsung keluar.
      const [order] = await conn.query(
        `INSERT INTO orders (user_id, user_name, total, note, status, decided_by_name, decided_at)
         VALUES (?, ?, ?, ?, 'approved', 'Otomatis', NOW())`,
        [req.user.id, req.user.name, total, note],
      )
      await conn.query(
        'INSERT INTO order_items (order_id, item_id, item_name, image_url, qty, unit_price, cost) VALUES ?',
        [
          lines.map((l) => {
            const item = byId.get(l.item_id)
            return [order.insertId, l.item_id, item.name, item.image_url, l.qty, item.price, item.cost_price]
          }),
        ],
      )
      await allocateStock(
        conn,
        { id: null, name: 'Sistem' },
        { id: order.insertId, user_name: req.user.name },
        lines.map((l) => ({ ...l, item_name: byId.get(l.item_id).name })),
      )
      await notifyLowStock(conn, lines.map((l) => l.item_id))
      await audit(
        req.user,
        { entity: 'order', id: order.insertId, label: `Pesanan #${order.insertId}`, action: 'create', after: { total, jenis_barang: lines.length } },
        conn,
      )
      await notifyStaff(
        conn,
        req.user,
        {
          kind: 'order_new',
          title: `Pesanan baru #${order.insertId}`,
          body: `${req.user.name} · $${total.toLocaleString('en-US')} · ${lines.length} jenis barang`,
          link: '/orders',
          fields: [
            { name: 'Pembeli', value: req.user.name, inline: true },
            { name: 'Total', value: formatUsd(total), inline: true },
            { name: 'Barang', value: summarizeItems(lines.map((l) => ({ name: byId.get(l.item_id).name, qty: l.qty }))) },
            ...(note ? [{ name: 'Catatan', value: note }] : []),
          ],
        },
        { discord: true },
      )
      return order.insertId
    })

    res.status(201).json({ id: orderId })
  }),
)

ordersRouter.get(
  '/',
  wrap(async (req, res) => {
    const where = []
    const params = []
    if (!isStaff(req.user)) {
      where.push('o.user_id = ?')
      params.push(req.user.id)
    }
    // status boleh satu atau beberapa dipisah koma, mis. status=cancelled,rejected.
    const statuses = String(req.query.status ?? '')
      .split(',')
      .filter((s) => ['pending', 'approved', 'rejected', 'cancelled'].includes(s))
    if (statuses.length) {
      where.push('o.status IN (?)')
      params.push(statuses)
    }
    // Pesanan yang masih harus dibayar: belum lunas dan masih berlaku (bukan ditolak/dibatalkan).
    if (req.query.payment === 'unpaid') where.push(`o.paid = 0 AND o.status IN ('pending', 'approved')`)
    else if (req.query.payment === 'paid') where.push('o.paid = 1')
    // Penyerahan barang (dicentang petugas brangkas): hanya bermakna untuk pesanan yang disetujui dan sudah dibayar.
    if (req.query.delivery === 'pending')
      where.push(
        `o.status = 'approved' AND o.paid = 1 AND EXISTS (SELECT 1 FROM order_items h WHERE h.order_id = o.id AND h.handed_at IS NULL)`,
      )
    else if (req.query.delivery === 'done')
      where.push(
        `o.status = 'approved' AND o.paid = 1 AND NOT EXISTS (SELECT 1 FROM order_items h WHERE h.order_id = o.id AND h.handed_at IS NULL)`,
      )

    // Cari: nomor pesanan, nama pembeli, atau nama barang di pesanan.
    const q = String(req.query.q ?? '').trim().slice(0, 100)
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`
      where.push(
        `(o.user_name LIKE ? OR o.id = ? OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.item_name LIKE ?))`,
      )
      params.push(like, /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : 0, like)
    }
    // Rentang tanggal (YYYY-MM-DD, hari menurut WIB). Waktu disimpan UTC.
    const wibDay = (value, endOfDay) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return null
      const d = new Date(`${value}T${endOfDay ? '23:59:59' : '00:00:00'}+07:00`)
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ')
    }
    const from = wibDay(req.query.from, false)
    const to = wibDay(req.query.to, true)
    if (from) {
      where.push('o.created_at >= ?')
      params.push(from)
    }
    if (to) {
      where.push('o.created_at <= ?')
      params.push(to)
    }

    // Tanpa parameter limit tetap 200 terbaru (perilaku lama); klien daftar pesanan memakai limit/offset.
    const limit = Math.min(Math.max(Math.floor(Number(req.query.limit)) || 200, 1), 200)
    const offset = Math.max(Math.floor(Number(req.query.offset)) || 0, 0)
    const orders = await query(
      `SELECT o.* FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY o.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    )
    if (orders.length === 0) return res.json([])

    const ids = orders.map((o) => o.id)
    const lines = await query(
      `SELECT order_id, item_id, item_name, image_url, qty, unit_price, handed_at, handed_by_name
         FROM order_items WHERE order_id IN (?) ORDER BY id`,
      [ids],
    )
    const allocations = await query(
      `SELECT a.order_id, a.item_id, a.qty, l.name AS location_name
         FROM order_allocations a JOIN locations l ON l.id = a.location_id
        WHERE a.order_id IN (?) ORDER BY a.id`,
      [ids],
    )
    const group = (rows) => {
      const m = new Map()
      for (const r of rows) m.set(r.order_id, [...(m.get(r.order_id) ?? []), r])
      return m
    }
    const linesBy = group(lines)
    const allocBy = group(allocations)
    res.json(
      orders.map((o) => ({
        ...o,
        total: Number(o.total),
        paid: !!o.paid,
        lines: (linesBy.get(o.id) ?? []).map((l) => ({ ...l, unit_price: Number(l.unit_price) })),
        allocations: allocBy.get(o.id) ?? [],
      })),
    )
  }),
)

// Angka penanda di tab Pesanan: yang masih butuh tindakan. Staff melihat semua pesanan, pembeli hanya miliknya.
ordersRouter.get(
  '/counts',
  wrap(async (req, res) => {
    const staff = isStaff(req.user)
    const [row] = await query(
      `SELECT
         SUM(o.status = 'pending') AS pending,
         SUM(o.status = 'approved' AND o.paid = 0) AS unpaid,
         SUM(o.status = 'approved' AND o.paid = 1
             AND EXISTS (SELECT 1 FROM order_items h WHERE h.order_id = o.id AND h.handed_at IS NULL)) AS handover
         FROM orders o
        WHERE o.status IN ('pending', 'approved')${staff ? '' : ' AND o.user_id = ?'}`,
      staff ? [] : [req.user.id],
    )
    res.json({ pending: Number(row.pending ?? 0), unpaid: Number(row.unpaid ?? 0), handover: Number(row.handover ?? 0) })
  }),
)

async function lockOrder(conn, id) {
  const [[order]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id])
  if (!order) throw new HttpError(404, 'Pesanan tidak ditemukan')
  return order
}

async function lockItems(conn, itemIds) {
  const [rows] = await conn.query(
    'SELECT id FROM items WHERE id IN (?) AND deleted_at IS NULL ORDER BY id FOR UPDATE',
    [itemIds],
  )
  if (rows.length !== itemIds.length) throw new HttpError(409, 'Ada barang di pesanan yang sudah dihapus')
}

const writeLog = (conn, user, order, { item_id, location_id, type, qty, note }) =>
  conn.query(
    `INSERT INTO inventory_logs (item_id, location_id, type, qty, note, user_id, user_name, ref_type, ref_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'order', ?)`,
    [item_id, location_id, type, qty, note, user.id, user.name, order.id],
  )

// Barang keluar dari lokasi "Dijual di Market" (stok terbanyak dulu), dicatat per lokasi di Riwayat dan
// order_allocations (dipakai untuk mengembalikan stok bila pesanan dibatalkan). Item harus sudah terkunci.
async function allocateStock(conn, actor, order, lines) {
  for (const line of lines) {
    const [locs] = await conn.query(
      `SELECT s.location_id, s.qty
         FROM stock_levels s
         JOIN locations l ON l.id = s.location_id AND l.deleted_at IS NULL AND l.sell_in_market = 1
        WHERE s.item_id = ? AND s.qty > 0
        ORDER BY s.qty DESC, s.location_id`,
      [line.item_id],
    )
    let left = line.qty
    for (const loc of locs) {
      if (left === 0) break
      const take = Math.min(left, Number(loc.qty))
      await writeLog(conn, actor, order, {
        item_id: line.item_id,
        location_id: loc.location_id,
        type: 'out',
        qty: take,
        note: `Pesanan #${order.id} · ${order.user_name}`,
      })
      await conn.query(
        'INSERT INTO order_allocations (order_id, item_id, location_id, qty) VALUES (?, ?, ?, ?)',
        [order.id, line.item_id, loc.location_id, take],
      )
      left -= take
    }
    if (left > 0) throw new HttpError(409, `Stok "${line.item_name}" di lokasi Market tidak cukup (kurang ${left})`)
  }
}

// Persetujuan manual: hanya untuk pesanan lama yang masih berstatus "menunggu" (sebelum pesanan otomatis aktif).
ordersRouter.post(
  '/:id/approve',
  requireStaff,
  wrap(async (req, res) => {
    await withTx(async (conn) => {
      const order = await lockOrder(conn, req.params.id)
      if (order.status !== 'pending') throw new HttpError(409, 'Pesanan sudah diproses')
      if (order.user_id === req.user.id && req.user.role !== 'admin')
        throw new HttpError(403, 'Tidak boleh menyetujui pesanan sendiri')

      const [lines] = await conn.query(
        'SELECT item_id, item_name, qty FROM order_items WHERE order_id = ? ORDER BY item_id',
        [order.id],
      )
      await lockItems(conn, lines.map((l) => l.item_id))
      await allocateStock(conn, req.user, order, lines)

      await audit(
        req.user,
        {
          entity: 'order',
          id: order.id,
          label: `Pesanan #${order.id}`,
          action: 'approve',
          details: { pembeli: order.user_name, total: Number(order.total) },
        },
        conn,
      )
      await notifyUsers(conn, [order.user_id].filter((u) => u !== req.user.id), {
        kind: 'order_approved',
        title: `Pesananmu #${order.id} disetujui`,
        link: '/orders',
      })
      await notifyLowStock(conn, lines.map((l) => l.item_id))
      await conn.query(
        `UPDATE orders SET status = 'approved', decided_by_name = ?, decided_at = NOW() WHERE id = ?`,
        [req.user.name, order.id],
      )
    })
    res.json({ ok: true })
  }),
)

ordersRouter.post(
  '/:id/reject',
  requireStaff,
  wrap(async (req, res) => {
    await withTx(async (conn) => {
      const order = await lockOrder(conn, req.params.id)
      if (order.status !== 'pending') throw new HttpError(409, 'Pesanan sudah diproses')
      await audit(
        req.user,
        { entity: 'order', id: order.id, label: `Pesanan #${order.id}`, action: 'reject', details: { pembeli: order.user_name } },
        conn,
      )
      await notifyUsers(conn, [order.user_id].filter((u) => u !== req.user.id), {
        kind: 'order_rejected',
        title: `Pesananmu #${order.id} ditolak`,
        link: '/orders',
      })
      await conn.query(
        `UPDATE orders SET status = 'rejected', decided_by_name = ?, decided_at = NOW() WHERE id = ?`,
        [req.user.name, order.id],
      )
    })
    res.json({ ok: true })
  }),
)

// Staff menandai pesanan sudah / belum dibayar. Hanya pesanan yang masih berlaku yang bisa ditandai lunas.
ordersRouter.post(
  '/:id/payment',
  requireStaff,
  wrap(async (req, res) => {
    const paid = req.body?.paid === true
    await withTx(async (conn) => {
      const order = await lockOrder(conn, req.params.id)
      if (paid && !['pending', 'approved'].includes(order.status))
        throw new HttpError(409, 'Pesanan yang ditolak atau dibatalkan tidak perlu dibayar')
      if (!paid) {
        const [[{ handedCount }]] = await conn.query(
          'SELECT COUNT(*) AS handedCount FROM order_items WHERE order_id = ? AND handed_at IS NOT NULL',
          [order.id],
        )
        if (Number(handedCount) > 0)
          throw new HttpError(409, 'Sebagian barang sudah diserahkan ke pembeli. Batalkan centang penyerahan dulu.')
      }
      await audit(
        req.user,
        { entity: 'order', id: order.id, label: `Pesanan #${order.id}`, action: paid ? 'mark_paid' : 'mark_unpaid', details: { pembeli: order.user_name } },
        conn,
      )
      await conn.query(
        'UPDATE orders SET paid = ?, paid_at = ?, paid_by_name = ? WHERE id = ?',
        paid ? [1, new Date(), req.user.name, order.id] : [0, null, null, order.id],
      )

      if (paid) {
        const [[existing]] = await conn.query(
          "SELECT id FROM cash_entries WHERE ref_type = 'order' AND ref_id = ? AND deleted_at IS NULL LIMIT 1",
          [order.id],
        )
        if (!existing) {
          const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10) // tanggal WIB
          const [ins] = await conn.query(
            `INSERT INTO cash_entries (entry_date, type, category, amount, counterparty, note, wash_status,
                                       ref_type, ref_id, created_by, created_by_name)
             VALUES (?, 'income', 'market_sales', ?, ?, ?, 'dirty', 'order', ?, ?, ?)`,
            [today, order.total, order.user_name, `Pesanan #${order.id} (otomatis)`, order.id, req.user.id, req.user.name],
          )
          await audit(
            req.user,
            {
              entity: 'cash',
              id: ins.insertId,
              label: `Pemasukan Penjualan Market`,
              action: 'create',
              after: { kategori: 'market_sales', nominal: Number(order.total), sumber_tujuan: order.user_name },
              details: { dari: `Pesanan #${order.id} ditandai lunas` },
            },
            conn,
          )
        }
      } else {
        const [removed] = await conn.query(
          "UPDATE cash_entries SET deleted_at = NOW() WHERE ref_type = 'order' AND ref_id = ? AND deleted_at IS NULL",
          [order.id],
        )
        if (removed.affectedRows) {
          await audit(
            req.user,
            {
              entity: 'cash',
              label: 'Pemasukan Penjualan Market',
              action: 'delete',
              details: { alasan: `Pembayaran pesanan #${order.id} dibatalkan` },
            },
            conn,
          )
        }
      }
    })
    res.json({ ok: true })
  }),
)

// Petugas brangkas mencentang barang yang sudah diserahkan ke pembeli. Hanya untuk pesanan yang sudah disetujui
// DAN dibayar. Body: { item_ids: number[], handed: boolean } (handed=false membatalkan centang).
ordersRouter.post(
  '/:id/handover',
  requireStaff,
  wrap(async (req, res) => {
    const handed = req.body?.handed !== false
    const ids = [...new Set((Array.isArray(req.body?.item_ids) ? req.body.item_ids : []).map(Number))]
    if (!ids.length || ids.some((n) => !Number.isInteger(n) || n <= 0))
      throw new HttpError(400, 'Pilih barang yang diserahkan')
    await withTx(async (conn) => {
      const order = await lockOrder(conn, req.params.id)
      if (order.status !== 'approved') throw new HttpError(409, 'Hanya pesanan yang sudah disetujui yang bisa diserahkan')
      if (!order.paid)
        throw new HttpError(409, 'Pesanan belum dibayar. Tandai sudah dibayar dulu sebelum barang diserahkan.')
      const [lines] = await conn.query(
        'SELECT item_id, item_name, qty, handed_at FROM order_items WHERE order_id = ? ORDER BY item_id FOR UPDATE',
        [order.id],
      )
      const chosen = lines.filter((l) => ids.includes(l.item_id))
      if (chosen.length !== ids.length) throw new HttpError(400, 'Ada barang yang bukan bagian dari pesanan ini')
      const changed = chosen.filter((l) => !!l.handed_at !== handed)
      if (changed.length === 0) return
      const changedIds = changed.map((l) => l.item_id)
      if (handed)
        await conn.query('UPDATE order_items SET handed_at = NOW(), handed_by_name = ? WHERE order_id = ? AND item_id IN (?)', [
          req.user.name,
          order.id,
          changedIds,
        ])
      else
        await conn.query('UPDATE order_items SET handed_at = NULL, handed_by_name = NULL WHERE order_id = ? AND item_id IN (?)', [
          order.id,
          changedIds,
        ])
      await audit(
        req.user,
        {
          entity: 'order',
          id: order.id,
          label: `Pesanan #${order.id}`,
          action: handed ? 'handover' : 'unhandover',
          details: { pembeli: order.user_name, barang: changed.map((l) => `${l.item_name} ×${l.qty}`).join(', ') },
        },
        conn,
      )
      if (handed) {
        const [[{ remaining }]] = await conn.query(
          'SELECT COUNT(*) AS remaining FROM order_items WHERE order_id = ? AND handed_at IS NULL',
          [order.id],
        )
        if (Number(remaining) === 0)
          await notifyUsers(conn, [order.user_id].filter((u) => u !== req.user.id), {
            kind: 'order_handed',
            title: `Pesananmu #${order.id} sudah diserahkan`,
            link: '/orders',
          })
      }
    })
    res.json({ ok: true })
  }),
)

// Staff: pesanan menunggu atau aktif (stok dikembalikan ke lokasi asal). Member: pesanannya sendiri selama
// belum dibayar. Pesanan yang barangnya sudah ada yang diserahkan tidak bisa dibatalkan.
ordersRouter.post(
  '/:id/cancel',
  wrap(async (req, res) => {
    const staff = isStaff(req.user)
    await withTx(async (conn) => {
      const order = await lockOrder(conn, req.params.id)
      if (!staff && order.user_id !== req.user.id) throw new HttpError(404, 'Pesanan tidak ditemukan')

      if (order.status === 'pending') {
        // langsung dibatalkan; stok belum terpotong
      } else if (order.status === 'approved' && (staff || (order.user_id === req.user.id && !order.paid))) {
        const [[{ handedCount }]] = await conn.query(
          'SELECT COUNT(*) AS handedCount FROM order_items WHERE order_id = ? AND handed_at IS NOT NULL',
          [order.id],
        )
        if (Number(handedCount) > 0)
          throw new HttpError(
            409,
            'Sebagian barang sudah diserahkan ke pembeli. Batalkan centang penyerahan dulu sebelum membatalkan pesanan.',
          )
        const [allocs] = await conn.query(
          'SELECT item_id, location_id, qty FROM order_allocations WHERE order_id = ? ORDER BY item_id',
          [order.id],
        )
        await lockItems(conn, [...new Set(allocs.map((a) => a.item_id))])
        for (const a of allocs) {
          await writeLog(conn, req.user, order, {
            item_id: a.item_id,
            location_id: a.location_id,
            type: 'in',
            qty: a.qty,
            note: `Pesanan #${order.id} dibatalkan · stok dikembalikan`,
          })
        }
      } else {
        throw new HttpError(409, 'Pesanan ini tidak bisa dibatalkan')
      }

      await audit(
        req.user,
        { entity: 'order', id: order.id, label: `Pesanan #${order.id}`, action: 'cancel', details: { pembeli: order.user_name, status_sebelumnya: order.status } },
        conn,
      )
      if (staff) {
        await notifyUsers(conn, [order.user_id].filter((u) => u !== req.user.id), {
          kind: 'order_cancelled',
          title: `Pesananmu #${order.id} dibatalkan`,
          link: '/orders',
        })
      } else {
        await notifyStaff(conn, req.user, {
          kind: 'order_cancelled',
          title: `Pesanan #${order.id} dibatalkan member`,
          body: order.user_name,
          link: '/orders',
        })
      }
      await conn.query(
        `UPDATE orders SET status = 'cancelled', cancelled_by_name = ?, cancelled_at = NOW() WHERE id = ?`,
        [req.user.name, order.id],
      )
    })
    res.json({ ok: true })
  }),
)
