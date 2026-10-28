import { Router } from 'express'
import { query, withTx } from '../db.js'
import { isStaff, requireStaff } from '../auth.js'
import { HttpError, posInt, str, wrap } from '../util.js'
import { MARKET_STOCK, RESERVED } from '../stock.js'

export const marketRouter = Router()
export const ordersRouter = Router()

// Stok tersedia di Market = stok lokasi "Dijual di Market" dikurangi yang sudah dipesan
// (pesanan Market dan pengajuan yang masih menunggu).

const MAX_LINES = 50

/* ---------- Market: daftar barang ---------- */

marketRouter.get(
  '/items',
  wrap(async (_req, res) => {
    const rows = await query(
      `SELECT i.id, i.name, i.category, i.unit, i.price, i.image_url,
              GREATEST(${MARKET_STOCK} - ${RESERVED}, 0) AS available
         FROM items i
        WHERE i.deleted_at IS NULL AND i.in_market = 1 AND i.price > 0
        ORDER BY i.category, i.name`,
    )
    res.json(rows.map((r) => ({ ...r, price: Number(r.price), available: Number(r.available) })))
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
        `SELECT id, name, price, image_url, in_market FROM items
          WHERE id IN (?) AND deleted_at IS NULL ORDER BY id FOR UPDATE`,
        [lines.map((l) => l.item_id)],
      )
      const byId = new Map(items.map((i) => [i.id, i]))
      let total = 0
      for (const l of lines) {
        const item = byId.get(l.item_id)
        if (!item || !item.in_market || Number(item.price) <= 0)
          throw new HttpError(409, 'Ada barang yang tidak dijual lagi')
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

      const [order] = await conn.query(
        'INSERT INTO orders (user_id, user_name, total, note) VALUES (?, ?, ?, ?)',
        [req.user.id, req.user.name, total, note],
      )
      await conn.query(
        'INSERT INTO order_items (order_id, item_id, item_name, image_url, qty, unit_price) VALUES ?',
        [
          lines.map((l) => {
            const item = byId.get(l.item_id)
            return [order.insertId, l.item_id, item.name, item.image_url, l.qty, item.price]
          }),
        ],
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
    if (['pending', 'approved', 'rejected', 'cancelled'].includes(req.query.status)) {
      where.push('o.status = ?')
      params.push(req.query.status)
    }
    // Pesanan yang masih harus dibayar: belum lunas dan masih berlaku (bukan ditolak/dibatalkan).
    if (req.query.payment === 'unpaid') where.push(`o.paid = 0 AND o.status IN ('pending', 'approved')`)
    else if (req.query.payment === 'paid') where.push('o.paid = 1')
    const orders = await query(
      `SELECT o.* FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY o.id DESC LIMIT 200`,
      params,
    )
    if (orders.length === 0) return res.json([])

    const ids = orders.map((o) => o.id)
    const lines = await query(
      `SELECT order_id, item_id, item_name, image_url, qty, unit_price
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

// Disetujui: barang keluar dari lokasi "Dijual di Market" (stok terbanyak dulu), dicatat per lokasi.
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
          await writeLog(conn, req.user, order, {
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
        if (left > 0)
          throw new HttpError(409, `Stok "${line.item_name}" di lokasi Market tidak cukup (kurang ${left})`)
      }

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
      await conn.query(
        'UPDATE orders SET paid = ?, paid_at = ?, paid_by_name = ? WHERE id = ?',
        paid ? [1, new Date(), req.user.name, order.id] : [0, null, null, order.id],
      )
    })
    res.json({ ok: true })
  }),
)

// Member: hanya pesanannya sendiri yang masih menunggu. Staff: menunggu atau sudah disetujui
// (stok dikembalikan ke lokasi asal).
ordersRouter.post(
  '/:id/cancel',
  wrap(async (req, res) => {
    const staff = isStaff(req.user)
    await withTx(async (conn) => {
      const order = await lockOrder(conn, req.params.id)
      if (!staff && order.user_id !== req.user.id) throw new HttpError(404, 'Pesanan tidak ditemukan')

      if (order.status === 'pending') {
        // langsung dibatalkan; stok belum terpotong
      } else if (order.status === 'approved' && staff) {
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

      await conn.query(
        `UPDATE orders SET status = 'cancelled', cancelled_by_name = ?, cancelled_at = NOW() WHERE id = ?`,
        [req.user.name, order.id],
      )
    })
    res.json({ ok: true })
  }),
)
