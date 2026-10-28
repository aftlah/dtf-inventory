import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { publicUser, requireAuth, signToken } from '../auth.js'
import { HttpError, duplicateAs, str, wrap } from '../util.js'
import { notifyUsers, sendDiscord } from '../notify.js'
import { audit } from '../audit.js'
import { createLimiter } from '../security.js'

export const authRouter = Router()

// Batas percobaan gagal per 15 menit: per (IP + username), per IP (banyak username), dan per akun untuk ganti password.
const WINDOW_MS = 15 * 60 * 1000
const byPair = createLimiter({ windowMs: WINDOW_MS, max: 8 })
const byIp = createLimiter({ windowMs: WINDOW_MS, max: 30 })
const byAccount = createLimiter({ windowMs: WINDOW_MS, max: 8 })
// Pengajuan akun terbuka untuk umum: batasi 5 kiriman per jam per IP dan 100 permintaan yang menunggu.
const byRequest = createLimiter({ windowMs: 60 * 60 * 1000, max: 5 })
const MAX_PENDING_REQUESTS = 100

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
      // Pemohon akun yang password-nya BENAR diberi tahu statusnya, bukan "password salah". Pesan status sengaja
      // hanya muncul bila password cocok, supaya orang lain tidak bisa menebak username mana yang sedang menunggu.
      // bcrypt.compare selalu dijalankan (pakai hash palsu bila tidak ada permintaan) agar waktu respons sama.
      const [request] = user
        ? []
        : await query(
            'SELECT status, password_hash FROM account_requests WHERE username = ? ORDER BY id DESC LIMIT 1',
            [username],
          )
      const matches = await bcrypt.compare(password, request?.password_hash ?? DUMMY_HASH)
      if (request && matches && request.status === 'pending')
        throw new HttpError(403, 'Akunmu belum disetujui admin. Mohon tunggu sampai permintaanmu disetujui.')
      if (request && matches && request.status === 'rejected')
        throw new HttpError(403, 'Permintaan akunmu ditolak admin. Hubungi admin untuk informasi lebih lanjut.')
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

// Pengajuan akun dari halaman login. Belum membuat pengguna: admin yang menyetujui.
authRouter.post(
  '/request-account',
  wrap(async (req, res) => {
    const ip = req.ip ?? 'unknown'
    assertNotBlocked([byRequest, ip])
    byRequest.fail(ip) // setiap kiriman dihitung, berhasil atau tidak

    const b = req.body ?? {}
    if (b.website) return res.status(201).json({ ok: true }) // kolom jebakan untuk bot: pura-pura berhasil

    const name = str(b.name, { field: 'Nama', max: 100, required: true })
    if (name.length < 2) throw new HttpError(400, 'Nama terlalu pendek')
    const username = String(b.username ?? '').trim().toLowerCase()
    if (!/^[a-z0-9._-]{3,30}$/.test(username))
      throw new HttpError(400, 'Username 3–30 karakter: huruf kecil, angka, titik, atau strip')
    const password = String(b.password ?? '')
    if (password.length < 8 || password.length > 72) throw new HttpError(400, 'Password 8–72 karakter')

    const [{ pending }] = await query("SELECT COUNT(*) AS pending FROM account_requests WHERE status = 'pending'")
    if (Number(pending) >= MAX_PENDING_REQUESTS)
      throw new HttpError(503, 'Permintaan akun sedang penuh. Silakan hubungi admin.')
    const [taken] = await query('SELECT 1 FROM users WHERE username = ?', [username])
    if (taken) throw new HttpError(409, 'Username sudah dipakai, pilih yang lain')

    let id
    try {
      const r = await query(
        'INSERT INTO account_requests (name, username, password_hash, ip) VALUES (?, ?, ?, ?)',
        [name, username, await bcrypt.hash(password, 10), ip.slice(0, 45)],
      )
      id = r.insertId
    } catch (e) {
      throw duplicateAs(e, 'Sudah ada permintaan dengan username itu, tunggu persetujuan admin')
    }

    const admins = await query("SELECT id FROM users WHERE active = 1 AND role = 'admin'")
    await notifyUsers(undefined, admins.map((a) => a.id), {
      kind: 'account_request',
      title: 'Permintaan akun baru',
      body: `${name} (@${username}) ingin membuat akun`,
      link: '/users',
    })
    sendDiscord(null, {
      kind: 'account_request',
      title: 'Permintaan akun baru',
      description: 'Menunggu persetujuan admin di menu Pengguna → Permintaan akun.',
      link: '/users',
      fields: [
        { name: 'Nama', value: name, inline: true },
        { name: 'Username', value: `@${username}`, inline: true },
      ],
    })
    await audit(null, { entity: 'user', id, label: username, action: 'account_request', after: { name, username } })
    res.status(201).json({ ok: true })
  }),
)
