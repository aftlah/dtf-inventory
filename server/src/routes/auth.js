import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { publicUser, requireAuth, signToken } from '../auth.js'
import { HttpError, wrap } from '../util.js'

export const authRouter = Router()

// Hash palsu agar waktu respons sama untuk username yang tidak ada.
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10)

authRouter.post(
  '/login',
  wrap(async (req, res) => {
    const username = String(req.body?.username ?? '').trim().toLowerCase()
    const password = String(req.body?.password ?? '')
    const [user] = await query('SELECT * FROM users WHERE username = ?', [username])
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)
    if (!user || !ok || !user.active) throw new HttpError(401, 'Username atau password salah')
    res.json({ token: signToken(user), user: publicUser(user) })
  }),
)

authRouter.get('/me', requireAuth, (req, res) => res.json(publicUser(req.user)))

authRouter.post(
  '/password',
  requireAuth,
  wrap(async (req, res) => {
    const current = String(req.body?.current ?? '')
    const next = String(req.body?.next ?? '')
    if (next.length < 8) throw new HttpError(400, 'Password baru minimal 8 karakter')
    const [user] = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id])
    if (!(await bcrypt.compare(current, user.password_hash)))
      throw new HttpError(400, 'Password saat ini salah')
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [
      await bcrypt.hash(next, 10),
      req.user.id,
    ])
    res.json({ ok: true })
  }),
)
