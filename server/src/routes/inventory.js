import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { query, withTx } from '../db.js'
import { HttpError, posInt, str, wrap } from '../util.js'
import { notifyLowStock } from '../notify.js'

// Awal hari ini menurut WIB, dinyatakan dalam UTC (sesi database memakai UTC).
const TODAY_START = `CONVERT_TZ(DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00')), '+07:00', '+00:00')`

export const inventoryRouter = Router()

inventoryRouter.get(
  '/stock',
  wrap(async (_req, res) => {
    const rows = await query(
      `SELECT s.item_id, s.location_id, s.qty
         FROM stock_levels s
         JOIN items i ON i.id = s.item_id AND i.deleted_at IS NULL
         JOIN locations l ON l.id = s.location_id AND l.deleted_at IS NULL
        WHERE s.qty <> 0`,
    )
    res.json(rows.map((r) => ({ ...r, qty: Number(r.qty) })))
  }),
)

async function stockAt(conn, itemId, locationId) {
  const [[row]] = await conn.query(
    'SELECT COALESCE(SUM(qty), 0) AS qty FROM stock_levels WHERE item_id = ? AND location_id = ?',
    [itemId, locationId],
  )
  return Number(row.qty)
}

async function lockItemAndCheckLocations(conn, itemId, locationIds) {
  // Kunci baris barang: pencatatan untuk barang yang sama berjalan berurutan, jadi stok tidak bisa minus.
  const [items] = await conn.query(
    'SELECT id FROM items WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
    [itemId],
  )
  if (!items.length) throw new HttpError(404, 'Barang tidak ditemukan')
  for (const id of locationIds) {
    const [locs] = await conn.query('SELECT id FROM locations WHERE id = ? AND deleted_at IS NULL', [id])
    if (!locs.length) throw new HttpError(404, 'Lokasi tidak ditemukan')
  }
}

// type: in | out | transfer (transfer butuh to_location_id)
inventoryRouter.post(
  '/movements',
  wrap(async (req, res) => {
    const b = req.body ?? {}
    const type = b.type
    if (!['in', 'out', 'transfer'].includes(type)) throw new HttpError(400, 'Tipe tidak valid')
    const itemId = posInt(b.item_id, 'Barang')
    const locId = posInt(b.location_id, 'Lokasi')
    const qty = posInt(b.qty, 'Jumlah')
    const note = str(b.note, { field: 'Catatan', max: 500 })
    const toId = type === 'transfer' ? posInt(b.to_location_id, 'Lokasi tujuan') : null
    if (toId === locId) throw new HttpError(400, 'Lokasi asal dan tujuan harus berbeda')
    const { id: userId, name: userName } = req.user

    await withTx(async (conn) => {
      const insert = (loc, t, transferId = null) =>
        conn.query(
          `INSERT INTO inventory_logs (item_id, location_id, type, qty, note, user_id, user_name, transfer_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [itemId, loc, t, qty, note, userId, userName, transferId],
        )

      await lockItemAndCheckLocations(conn, itemId, toId ? [locId, toId] : [locId])

      if (type === 'in') {
        await insert(locId, 'in')
        return
      }

      const have = await stockAt(conn, itemId, locId)
      if (have < qty) throw new HttpError(409, `Stok tidak cukup (tersedia ${have})`)

      if (type === 'out') {
        await insert(locId, 'out')
        await notifyLowStock(conn, [itemId])
        return
      }

      const transferId = randomUUID()
      await insert(locId, 'transfer_out', transferId)
      await insert(toId, 'transfer_in', transferId)
    })

    res.status(201).json({ ok: true })
  }),
)

inventoryRouter.get(
  '/logs',
  wrap(async (req, res) => {
    const where = []
    const params = []
    for (const [key, col] of [
      ['item_id', 'l.item_id'],
      ['location_id', 'l.location_id'],
    ]) {
      const v = Number(req.query[key])
      if (v) {
        where.push(`${col} = ?`)
        params.push(v)
      }
    }
    if (['in', 'out', 'transfer_in', 'transfer_out'].includes(req.query.type)) {
      where.push('l.type = ?')
      params.push(req.query.type)
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const rows = await query(
      `SELECT l.id, l.item_id, i.name AS item_name, i.unit, l.location_id, loc.name AS location_name,
              l.type, l.qty, l.note, l.user_name, l.transfer_id, l.created_at
         FROM inventory_logs l
         JOIN items i ON i.id = l.item_id
         JOIN locations loc ON loc.id = l.location_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY l.id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit + 1, offset],
    )
    res.json({ rows: rows.slice(0, limit), hasMore: rows.length > limit })
  }),
)

inventoryRouter.get(
  '/dashboard',
  wrap(async (_req, res) => {
    const [counts] = await query(
      `SELECT
          (SELECT COUNT(*) FROM items WHERE deleted_at IS NULL) AS items,
          (SELECT COUNT(*) FROM locations WHERE deleted_at IS NULL) AS locations,
          (SELECT COALESCE(SUM(s.qty), 0) FROM stock_levels s
             JOIN items i ON i.id = s.item_id AND i.deleted_at IS NULL
             JOIN locations l ON l.id = s.location_id AND l.deleted_at IS NULL) AS units,
          (SELECT COUNT(*) FROM inventory_logs WHERE type = 'in' AND created_at >= ${TODAY_START}) AS in_today,
          (SELECT COUNT(*) FROM inventory_logs WHERE type = 'out' AND created_at >= ${TODAY_START}) AS out_today,
          (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pending_orders,
          (SELECT COUNT(*) FROM requests WHERE status IN ('pending', 'reported')) AS open_requests`,
    )
    const lowStock = await query(
      `SELECT i.id, i.name, i.unit, i.min_stock, COALESCE(SUM(s.qty), 0) AS qty
         FROM items i
         LEFT JOIN stock_levels s ON s.item_id = i.id
        WHERE i.deleted_at IS NULL AND i.min_stock > 0
        GROUP BY i.id, i.name, i.unit, i.min_stock
       HAVING qty <= i.min_stock
        ORDER BY (COALESCE(SUM(s.qty), 0) - i.min_stock), i.name
        LIMIT 10`,
    )
    const recent = await query(
      `SELECT l.id, i.name AS item_name, i.unit, loc.name AS location_name, l.type, l.qty, l.user_name, l.created_at
         FROM inventory_logs l
         JOIN items i ON i.id = l.item_id
         JOIN locations loc ON loc.id = l.location_id
        ORDER BY l.id DESC LIMIT 8`,
    )
    res.json({
      counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])),
      lowStock: lowStock.map((r) => ({ ...r, qty: Number(r.qty) })),
      recent,
    })
  }),
)
