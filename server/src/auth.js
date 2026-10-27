import jwt from 'jsonwebtoken'
import { query } from './db.js'
import { HttpError, wrap } from './util.js'

const secret = process.env.JWT_SECRET
if (!secret || secret.length < 16) {
  console.error('JWT_SECRET belum diisi (minimal 16 karakter) di server/.env')
  process.exit(1)
}

export const signToken = (user) => jwt.sign({ sub: user.id }, secret, { expiresIn: '7d' })

export const publicUser = (u) => ({ id: u.id, name: u.name, username: u.username, role: u.role })

export const requireAuth = wrap(async (req, _res, next) => {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  let payload
  try {
    payload = jwt.verify(token, secret)
  } catch {
    throw new HttpError(401, 'Sesi berakhir, silakan login ulang')
  }
  const [user] = await query('SELECT id, name, username, role, active FROM users WHERE id = ?', [
    payload.sub,
  ])
  if (!user || !user.active) throw new HttpError(401, 'Akun tidak aktif')
  req.user = user
  next()
})

export const requireAdmin = (req, _res, next) =>
  req.user.role === 'admin' ? next() : next(new HttpError(403, 'Hanya admin'))

// Staff = admin atau staff. Role "member" hanya boleh memakai Market dan pesanannya sendiri.
export const isStaff = (user) => user.role === 'admin' || user.role === 'staff'

export const requireStaff = (req, _res, next) =>
  isStaff(req.user) ? next() : next(new HttpError(403, 'Tidak punya akses'))
