import { Router } from 'express'
import { query } from '../db.js'
import { requireAdmin } from '../auth.js'
import { HttpError, duplicateAs, posInt, str, wrap } from '../util.js'

export const catalogRouter = Router()

/* ---------- Items ---------- */

function itemBody(b) {
  return {
    name: str(b?.name, { field: 'Nama', max: 150, required: true }),
    category: str(b?.category, { field: 'Kategori', max: 60 }),
    unit: str(b?.unit, { field: 'Satuan', max: 20 }) ?? 'pcs',
    min_stock: posInt(b?.min_stock ?? 0, 'Stok minimum', { min: 0 }),
    notes: str(b?.notes, { field: 'Catatan', max: 500 }),
  }
}

catalogRouter.get(
  '/items',
  wrap(async (_req, res) => {
    res.json(
      await query(
        'SELECT id, name, category, unit, min_stock, notes FROM items WHERE deleted_at IS NULL ORDER BY name',
      ),
    )
  }),
)

catalogRouter.post(
  '/items',
  requireAdmin,
  wrap(async (req, res) => {
    const d = itemBody(req.body)
    try {
      const r = await query(
        'INSERT INTO items (name, category, unit, min_stock, notes) VALUES (?, ?, ?, ?, ?)',
        [d.name, d.category, d.unit, d.min_stock, d.notes],
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
        'UPDATE items SET name=?, category=?, unit=?, min_stock=?, notes=? WHERE id=? AND deleted_at IS NULL',
        [d.name, d.category, d.unit, d.min_stock, d.notes, req.params.id],
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
  }
}

catalogRouter.get(
  '/locations',
  wrap(async (_req, res) => {
    res.json(
      await query(
        'SELECT id, name, kind, notes FROM locations WHERE deleted_at IS NULL ORDER BY name',
      ),
    )
  }),
)

catalogRouter.post(
  '/locations',
  requireAdmin,
  wrap(async (req, res) => {
    const d = locationBody(req.body)
    try {
      const r = await query('INSERT INTO locations (name, kind, notes) VALUES (?, ?, ?)', [
        d.name,
        d.kind,
        d.notes,
      ])
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
        'UPDATE locations SET name=?, kind=?, notes=? WHERE id=? AND deleted_at IS NULL',
        [d.name, d.kind, d.notes, req.params.id],
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
