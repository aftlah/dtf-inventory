import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query, withTx } from '../db.js'
import { audit } from '../audit.js'
import { HttpError, duplicateAs, str, wrap } from '../util.js'

export const usersRouter = Router()

const ROLES = ['admin', 'staff', 'member']

function parseRole(role) {
  if (!ROLES.includes(role)) throw new HttpError(400, 'Role tidak valid')
  return role
}

function parsePassword(p) {
  const v = String(p ?? '')
  if (v.length < 8) throw new HttpError(400, 'Password minimal 8 karakter')
  return v
}

usersRouter.get(
  '/',
  wrap(async (_req, res) => {
    res.json(
      await query('SELECT id, name, username, role, active, created_at FROM users ORDER BY name'),
    )
  }),
)

usersRouter.post(
  '/',
  wrap(async (req, res) => {
    const b = req.body ?? {}
    const name = str(b.name, { field: 'Nama', max: 100, required: true })
    const username = str(b.username, { field: 'Username', max: 50, required: true }).toLowerCase()
    if (!/^[a-z0-9._-]+$/.test(username))
      throw new HttpError(400, 'Username hanya huruf kecil, angka, titik, strip')
    const role = parseRole(b.role)
    const hash = await bcrypt.hash(parsePassword(b.password), 10)
    let id
    try {
      const r = await query(
        'INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)',
        [name, username, hash, role],
      )
      id = r.insertId
    } catch (e) {
      throw duplicateAs(e, 'Username sudah dipakai')
    }
    await audit(req.user, { entity: 'user', id, label: username, action: 'create', after: { name, username, role } })
    res.status(201).json({ id })
  }),
)

usersRouter.put(
  '/:id',
  wrap(async (req, res) => {
    const b = req.body ?? {}
    const id = Number(req.params.id)
    const name = str(b.name, { field: 'Nama', max: 100, required: true })
    const role = parseRole(b.role)
    const active = b.active ? 1 : 0
    if (id === req.user.id && (role !== 'admin' || !active))
      throw new HttpError(400, 'Tidak bisa menurunkan atau menonaktifkan akun sendiri')
    const [before] = await query('SELECT name, username, role, active FROM users WHERE id = ?', [id])
    if (!before) throw new HttpError(404, 'Pengguna tidak ditemukan')
    await query('UPDATE users SET name=?, role=?, active=? WHERE id=?', [name, role, active, id])
    if (b.password) {
      await query('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(parsePassword(b.password), 10), id])
    }
    // Password tidak pernah dicatat; hanya dicatat bahwa password direset.
    await audit(req.user, {
      entity: 'user',
      id,
      label: before.username,
      action: 'update',
      before: { name: before.name, role: before.role, active: before.active },
      after: { name, role, active },
      details: b.password ? { password: 'direset' } : undefined,
    })
    res.json({ ok: true })
  }),
)

/* ---------- Permintaan akun dari halaman login ---------- */

usersRouter.get(
  '/requests',
  wrap(async (_req, res) => {
    res.json(
      await query(
        `SELECT id, name, username, created_at FROM account_requests
          WHERE status = 'pending' ORDER BY id`,
      ),
    )
  }),
)

usersRouter.post(
  '/requests/:id/approve',
  wrap(async (req, res) => {
    const role = req.body?.role ?? 'member'
    if (!['member', 'staff'].includes(role)) throw new HttpError(400, 'Role tidak valid')
    const userId = await withTx(async (conn) => {
      const [[request]] = await conn.query('SELECT * FROM account_requests WHERE id = ? FOR UPDATE', [req.params.id])
      if (!request) throw new HttpError(404, 'Permintaan tidak ditemukan')
      if (request.status !== 'pending') throw new HttpError(409, 'Permintaan sudah diproses')
      const [[taken]] = await conn.query('SELECT 1 AS x FROM users WHERE username = ?', [request.username])
      if (taken) throw new HttpError(409, 'Username itu sudah dipakai akun lain')
      const [r] = await conn.query(
        'INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)',
        [request.name, request.username, request.password_hash, role],
      )
      await conn.query(
        "UPDATE account_requests SET status = 'approved', decided_by_name = ?, decided_at = NOW() WHERE id = ?",
        [req.user.name, request.id],
      )
      await audit(
        req.user,
        { entity: 'user', id: r.insertId, label: request.username, action: 'account_approve', after: { name: request.name, username: request.username, role } },
        conn,
      )
      return r.insertId
    })
    res.json({ ok: true, id: userId })
  }),
)

usersRouter.post(
  '/requests/:id/reject',
  wrap(async (req, res) => {
    await withTx(async (conn) => {
      const [[request]] = await conn.query('SELECT * FROM account_requests WHERE id = ? FOR UPDATE', [req.params.id])
      if (!request) throw new HttpError(404, 'Permintaan tidak ditemukan')
      if (request.status !== 'pending') throw new HttpError(409, 'Permintaan sudah diproses')
      await conn.query(
        "UPDATE account_requests SET status = 'rejected', decided_by_name = ?, decided_at = NOW() WHERE id = ?",
        [req.user.name, request.id],
      )
      await audit(
        req.user,
        { entity: 'user', label: request.username, action: 'account_reject', details: { nama: request.name } },
        conn,
      )
    })
    res.json({ ok: true })
  }),
)
