import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { publicUser, requireAuth, signToken } from '../auth.js'
import { HttpError, wrap } from '../util.js'
import { audit } from '../audit.js'
import { createLimiter } from '../security.js'

export const authRouter = Router()

// Batas percobaan gagal per 15 menit: per (IP + username), per IP (banyak username), dan per akun untuk ganti password.
const WINDOW_MS = 15 * 60 * 1000
const byPair = createLimiter({ windowMs: WINDOW_MS, max: 8 })
const byIp = createLimiter({ windowMs: WINDOW_MS, max: 30 })
const byAccount = createLimiter({ windowMs: WINDOW_MS, max: 8 })

function assertNotBlocked(...checks) {
  const wait = Math.max(...checks.map(([limiter, key]) => limiter.blockedFor(key)))
  if (wait > 0)
    throw new HttpError(429, `Terlalu banyak percobaan. Coba lagi dalam ${Math.max(1, Math.ceil(wait / 60))} menit.`)
}

// Hash palsu agar waktu respons sama untuk username yang tidak ada.
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10)

authRouter.post(
  '/login',
  wrap(async (req, res) => {
    const username = String(req.body?.username ?? '').trim().toLowerCase()
    const password = String(req.body?.password ?? '')
    const ip = req.ip ?? 'unknown'
    const pair = `${ip}|${username}`
    assertNotBlocked([byPair, pair], [byIp, ip])
    const [user] = await query('SELECT * FROM users WHERE username = ?', [username])
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)
    if (!user || !ok || !user.active) {
      byPair.fail(pair)
      byIp.fail(ip)
      throw new HttpError(401, 'Username atau password salah')
    }
    byPair.reset(pair)
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
    const account = `u:${req.user.id}`
    assertNotBlocked([byAccount, account])
    const [user] = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id])
    if (!(await bcrypt.compare(current, user.password_hash))) {
      byAccount.fail(account)
      throw new HttpError(400, 'Password saat ini salah')
    }
    byAccount.reset(account)
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [
      await bcrypt.hash(next, 10),
      req.user.id,
    ])
    await audit(req.user, { entity: 'user', id: req.user.id, label: req.user.username, action: 'password_change' })
    res.json({ ok: true })
  }),
)
