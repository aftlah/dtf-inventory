import { Router } from 'express'
import { query } from '../db.js'
import { audit } from '../audit.js'
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
    cost_price: posInt(b?.cost_price ?? 0, 'Harga modal', { min: 0 }),
    image_url: imageUrl(b?.image_url),
    in_market: b?.in_market ? 1 : 0,
    in_sale: b?.in_sale ? 1 : 0,
    in_process: b?.in_process ? 1 : 0,
    min_sale_qty: posInt(b?.min_sale_qty ?? 1, 'Minimal penjualan', { min: 1 }),
    in_buyback: b?.in_buyback ? 1 : 0,
    buyback_price: posInt(b?.buyback_price ?? 0, 'Harga beli', { min: 0 }),
    max_buy_member: maxBuy(b?.max_buy_member, 'Batas beli member'),
    max_buy_highrank: maxBuy(b?.max_buy_highrank, 'Batas beli highrank'),
  }
}

// Batas beli per pesanan: kosong/null = tanpa batas.
function maxBuy(value, field) {
  if (value === null || value === undefined || value === '') return null
  return posInt(value, field)
}

const ITEM_FIELDS = Object.keys(itemBody({ name: 'x' }))
const ITEM_COLUMNS = ['id', ...ITEM_FIELDS].join(', ')

const toItem = (r) => ({
  ...r,
  price: Number(r.price),
  cost_price: Number(r.cost_price),
  buyback_price: Number(r.buyback_price),
  in_market: !!r.in_market,
  in_sale: !!r.in_sale,
  in_process: !!r.in_process,
  in_buyback: !!r.in_buyback,
})

catalogRouter.get(
  '/items',
  wrap(async (_req, res) => {
    const rows = await query(`SELECT ${ITEM_COLUMNS} FROM items WHERE deleted_at IS NULL ORDER BY name`)
    res.json(rows.map(toItem))
  }),
)

catalogRouter.post(
  '/items',
  requireAdmin,
  wrap(async (req, res) => {
    const d = itemBody(req.body)
    let id
    try {
      const r = await query(
        `INSERT INTO items (${ITEM_FIELDS.join(', ')}) VALUES (${ITEM_FIELDS.map(() => '?').join(', ')})`,
        ITEM_FIELDS.map((f) => d[f]),
      )
      id = r.insertId
    } catch (e) {
      throw duplicateAs(e, 'Nama barang sudah ada')
    }
    await audit(req.user, { entity: 'item', id, label: d.name, action: 'create', after: d })
    res.status(201).json({ id })
  }),
)

catalogRouter.put(
  '/items/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const d = itemBody(req.body)
    const [before] = await query(
      `SELECT ${ITEM_FIELDS.join(', ')} FROM items WHERE id = ? AND deleted_at IS NULL`,
      [req.params.id],
    )
    if (!before) throw new HttpError(404, 'Barang tidak ditemukan')
    try {
      await query(
        `UPDATE items SET ${ITEM_FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ? AND deleted_at IS NULL`,
        [...ITEM_FIELDS.map((f) => d[f]), req.params.id],
      )
    } catch (e) {
      throw duplicateAs(e, 'Nama barang sudah ada')
    }
    await audit(req.user, {
      entity: 'item',
      id: Number(req.params.id),
      label: d.name,
      action: 'update',
      before,
      after: d,
    })
    res.json({ ok: true })
  }),
)

catalogRouter.delete(
  '/items/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const [item] = await query('SELECT name FROM items WHERE id = ? AND deleted_at IS NULL', [req.params.id])
    if (!item) throw new HttpError(404, 'Barang tidak ditemukan')
    const held = await query(
      `SELECT l.name, s.qty FROM stock_levels s JOIN locations l ON l.id = s.location_id
        WHERE s.item_id = ? AND s.qty > 0 ORDER BY s.qty DESC`,
      [req.params.id],
    )
    if (held.length)
      throw new HttpError(
        409,
        `Barang masih punya stok (${held.map((h) => `${h.name}: ${Number(h.qty)}`).join(', ')}). Keluarkan dulu lewat menu Masuk / Keluar.`,
      )
    const [{ pending }] = await query(
      `SELECT COUNT(*) AS pending FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.item_id = ? AND o.status = 'pending'`,
      [req.params.id],
    )
    if (Number(pending) > 0) throw new HttpError(409, 'Barang masih ada di pesanan yang menunggu')
    const [{ pendingReq }] = await query(
      `SELECT COUNT(*) AS pendingReq FROM request_items ri JOIN requests r ON r.id = ri.request_id
        WHERE ri.item_id = ? AND r.status IN ('pending', 'approved', 'reported')`,
      [req.params.id],
    )
    if (Number(pendingReq) > 0) throw new HttpError(409, 'Barang masih ada di pengajuan yang belum selesai')
    await query('UPDATE items SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [req.params.id])
    await audit(req.user, { entity: 'item', id: Number(req.params.id), label: item.name, action: 'delete' })
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
    let id
    try {
      const r = await query('INSERT INTO locations (name, kind, notes, sell_in_market) VALUES (?, ?, ?, ?)', [
        d.name,
        d.kind,
        d.notes,
        d.sell_in_market,
      ])
      id = r.insertId
    } catch (e) {
      throw duplicateAs(e, 'Nama lokasi sudah ada')
    }
    await audit(req.user, { entity: 'location', id, label: d.name, action: 'create', after: d })
    res.status(201).json({ id })
  }),
)

catalogRouter.put(
  '/locations/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const d = locationBody(req.body)
    const [before] = await query(
      'SELECT name, kind, notes, sell_in_market FROM locations WHERE id = ? AND deleted_at IS NULL',
      [req.params.id],
    )
    if (!before) throw new HttpError(404, 'Lokasi tidak ditemukan')
    try {
      await query(
        'UPDATE locations SET name=?, kind=?, notes=?, sell_in_market=? WHERE id=? AND deleted_at IS NULL',
        [d.name, d.kind, d.notes, d.sell_in_market, req.params.id],
      )
    } catch (e) {
      throw duplicateAs(e, 'Nama lokasi sudah ada')
    }
    await audit(req.user, {
      entity: 'location',
      id: Number(req.params.id),
      label: d.name,
      action: 'update',
      before,
      after: d,
    })
    res.json({ ok: true })
  }),
)

catalogRouter.delete(
  '/locations/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const [loc] = await query('SELECT name FROM locations WHERE id = ? AND deleted_at IS NULL', [req.params.id])
    if (!loc) throw new HttpError(404, 'Lokasi tidak ditemukan')
    const held = await query(
      `SELECT i.name, s.qty FROM stock_levels s JOIN items i ON i.id = s.item_id
        WHERE s.location_id = ? AND s.qty > 0 ORDER BY s.qty DESC LIMIT 5`,
      [req.params.id],
    )
    if (held.length)
      throw new HttpError(
        409,
        `Lokasi masih berisi stok (${held.map((h) => `${h.name}: ${Number(h.qty)}`).join(', ')}). Pindahkan atau keluarkan dulu.`,
      )
    await query('UPDATE locations SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [req.params.id])
    await audit(req.user, { entity: 'location', id: Number(req.params.id), label: loc.name, action: 'delete' })
    res.json({ ok: true })
  }),
)
