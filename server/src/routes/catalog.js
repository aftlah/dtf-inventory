import { Router } from 'express'
import { query } from '../db.js'
import { requireAdmin } from '../auth.js'
import { HttpError, duplicateAs, posInt, str, wrap } from '../util.js'

export const catalogRouter = Router()

/* ---------- Items ---------- */

function imageUrl(value) {
  const v = str(value, { field: 'Gambar', max: 255 })
  if (v && !/^(\/[\w./-]+|https?:\/\/\S+)$/.test(v))
    throw new HttpError(400, 'Gambar harus berupa path (/items/foo.png) atau URL http(s)')
  return v
}

function itemBody(b) {
  return {
    name: str(b?.name, { field: 'Nama', max: 150, required: true }),
    category: str(b?.category, { field: 'Kategori', max: 60 }),
    unit: str(b?.unit, { field: 'Satuan', max: 20 }) ?? 'pcs',
    min_stock: posInt(b?.min_stock ?? 0, 'Stok minimum', { min: 0 }),
    notes: str(b?.notes, { field: 'Catatan', max: 500 }),
    price: posInt(b?.price ?? 0, 'Harga', { min: 0 }),
    image_url: imageUrl(b?.image_url),
    in_market: b?.in_market ? 1 : 0,
  }
}

const ITEM_COLUMNS = 'id, name, category, unit, min_stock, notes, price, image_url, in_market'

catalogRouter.get(
  '/items',
  wrap(async (_req, res) => {
    const rows = await query(
      `SELECT ${ITEM_COLUMNS} FROM items WHERE deleted_at IS NULL ORDER BY name`,
    )
    res.json(rows.map((r) => ({ ...r, price: Number(r.price), in_market: !!r.in_market })))
  }),
)

catalogRouter.post(
  '/items',
  requireAdmin,
  wrap(async (req, res) => {
    const d = itemBody(req.body)
    try {
      const r = await query(
        `INSERT INTO items (name, category, unit, min_stock, notes, price, image_url, in_market)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.name, d.category, d.unit, d.min_stock, d.notes, d.price, d.image_url, d.in_market],
      )
      res.status(201).json({ id: r.insertId })
    } catch (e) {
      throw duplicateAs(e, 'Nama barang sudah ada')
    }
  }),
)

catalogRouter.put(
  '/items/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const d = itemBody(req.body)
    let r
    try {
      r = await query(
        `UPDATE items SET name=?, category=?, unit=?, min_stock=?, notes=?, price=?, image_url=?, in_market=?
          WHERE id=? AND deleted_at IS NULL`,
        [d.name, d.category, d.unit, d.min_stock, d.notes, d.price, d.image_url, d.in_market, req.params.id],
      )
    } catch (e) {
      throw duplicateAs(e, 'Nama barang sudah ada')
    }
    if (!r.affectedRows) throw new HttpError(404, 'Barang tidak ditemukan')
    res.json({ ok: true })
  }),
)

catalogRouter.delete(
  '/items/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const [{ total }] = await query(
      'SELECT COALESCE(SUM(qty), 0) AS total FROM stock_levels WHERE item_id = ?',
      [req.params.id],
    )
    if (Number(total) > 0) throw new HttpError(409, 'Barang masih punya stok, kosongkan dulu')
    const [{ pending }] = await query(
      `SELECT COUNT(*) AS pending FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.item_id = ? AND o.status = 'pending'`,
      [req.params.id],
    )
    if (Number(pending) > 0) throw new HttpError(409, 'Barang masih ada di pesanan yang menunggu')
    const r = await query('UPDATE items SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [
      req.params.id,
    ])
    if (!r.affectedRows) throw new HttpError(404, 'Barang tidak ditemukan')
    res.json({ ok: true })
  }),
)

/* ---------- Locations ---------- */

function locationBody(b) {
  return {
    name: str(b?.name, { field: 'Nama', max: 100, required: true }),
    kind: str(b?.kind, { field: 'Jenis', max: 30 }) ?? 'warehouse',
    notes: str(b?.notes, { field: 'Catatan', max: 500 }),
    sell_in_market: b?.sell_in_market ? 1 : 0,
  }
}

catalogRouter.get(
  '/locations',
  wrap(async (_req, res) => {
    const rows = await query(
      'SELECT id, name, kind, notes, sell_in_market FROM locations WHERE deleted_at IS NULL ORDER BY name',
    )
    res.json(rows.map((r) => ({ ...r, sell_in_market: !!r.sell_in_market })))
  }),
)

catalogRouter.post(
  '/locations',
  requireAdmin,
  wrap(async (req, res) => {
    const d = locationBody(req.body)
    try {
      const r = await query(
        'INSERT INTO locations (name, kind, notes, sell_in_market) VALUES (?, ?, ?, ?)',
        [d.name, d.kind, d.notes, d.sell_in_market],
      )
      res.status(201).json({ id: r.insertId })
    } catch (e) {
      throw duplicateAs(e, 'Nama lokasi sudah ada')
    }
  }),
)

catalogRouter.put(
  '/locations/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const d = locationBody(req.body)
    let r
    try {
      r = await query(
        'UPDATE locations SET name=?, kind=?, notes=?, sell_in_market=? WHERE id=? AND deleted_at IS NULL',
        [d.name, d.kind, d.notes, d.sell_in_market, req.params.id],
      )
    } catch (e) {
      throw duplicateAs(e, 'Nama lokasi sudah ada')
    }
    if (!r.affectedRows) throw new HttpError(404, 'Lokasi tidak ditemukan')
    res.json({ ok: true })
  }),
)

catalogRouter.delete(
  '/locations/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const [{ total }] = await query(
      'SELECT COALESCE(SUM(qty), 0) AS total FROM stock_levels WHERE location_id = ?',
      [req.params.id],
    )
    if (Number(total) > 0) throw new HttpError(409, 'Lokasi masih berisi stok, pindahkan dulu')
    const r = await query(
      'UPDATE locations SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [req.params.id],
    )
    if (!r.affectedRows) throw new HttpError(404, 'Lokasi tidak ditemukan')
    res.json({ ok: true })
  }),
)
