import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { requireAdmin, requireAuth, requireStaff } from './auth.js'
import { pool } from './db.js'
import { describeError } from './errors.js'
import { schemaProblems } from './schema-check.js'
import { wrap } from './util.js'
import { authRouter } from './routes/auth.js'
import { cashRouter } from './routes/cash.js'
import { catalogRouter } from './routes/catalog.js'
import { inventoryRouter } from './routes/inventory.js'
import { marketRouter, ordersRouter } from './routes/orders.js'
import { requestsRouter } from './routes/requests.js'
import { auditRouter, financeRouter, meRouter, notificationsRouter } from './routes/system.js'
import { noStore, securityHeaders } from './security.js'
import { usersRouter } from './routes/users.js'

const app = express()
app.disable('x-powered-by')
// Di belakang proxy hosting (cPanel/Passenger, Cloudflare), isi TRUST_PROXY=1 agar IP asli pengguna terbaca
// (dipakai pembatas login) dan HTTPS terdeteksi. Jangan diisi bila server diakses langsung tanpa proxy.
if (process.env.TRUST_PROXY) {
  const v = process.env.TRUST_PROXY
  app.set('trust proxy', Number.isNaN(Number(v)) ? v : Number(v))
}
app.use(securityHeaders)
app.use(express.json({ limit: '100kb' }))

app.use('/api', noStore)
// Cek hidup (tanpa data): untuk memantau apakah server dan database bisa dipakai.
app.get(
  '/api/health',
  wrap(async (_req, res) => {
    try {
      await pool.query('SELECT 1')
      res.json({ ok: true })
    } catch {
      res.status(503).json({ ok: false, error: 'Database tidak bisa dihubungi' })
    }
  }),
)
// Admin: apakah database sudah sesuai versi aplikasi? Dipakai banner peringatan di tampilan admin.
app.get(
  '/api/system/schema',
  requireAuth,
  requireAdmin,
  wrap(async (_req, res) => {
    const problems = await schemaProblems()
    res.json({ ok: problems.length === 0, problems })
  }),
)
app.use('/api/auth', authRouter)
app.use('/api/users', requireAuth, requireAdmin, usersRouter)
// Semua akun (termasuk member): Market dan pesanan. Pembatasan per-aksi ada di dalam router.
app.use('/api/market', requireAuth, marketRouter)
app.use('/api/orders', requireAuth, ordersRouter)
app.use('/api/requests', requireAuth, requestsRouter)
app.use('/api/notifications', requireAuth, notificationsRouter)
app.use('/api/me', requireAuth, meRouter)
// Sisanya hanya admin/staff.
app.use('/api/cash', requireAuth, requireStaff, cashRouter)
app.use('/api/audit', requireAuth, requireStaff, auditRouter)
app.use('/api/finance', requireAuth, requireStaff, financeRouter)
app.use('/api', requireAuth, requireStaff, catalogRouter, inventoryRouter)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }))

// Produksi: sajikan hasil build frontend (client/dist) dengan fallback SPA.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.use((req, res, next) =>
    req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next(),
  )
}

// Penanganan error terpusat: pesan jelas untuk pengguna, kode referensi + detail lengkap di log server.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  const { status, body } = describeError(err, req)
  res.status(status).json(body)
})

// Kesalahan di luar permintaan (mis. di tugas latar): catat lengkap supaya terbaca di stderr.log hosting.
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason))
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  process.exit(1) // Passenger / pm2 menjalankan ulang proses
})

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`DTF Inventory API di http://localhost:${port}`)
  void startupChecks()
})

// Periksa database sekali saat start dan laporkan masalahnya dengan jelas di log (tidak menghentikan server).
async function startupChecks() {
  try {
    await pool.query('SELECT 1')
  } catch (err) {
    console.error(
      `PERINGATAN: database tidak bisa dihubungi (${err.code ?? err.name}: ${err.message}).\n` +
        'Periksa DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD di environment, dan pastikan MySQL menyala.',
    )
    return
  }
  try {
    const problems = await schemaProblems()
    if (problems.length)
      console.error(
        'PERINGATAN: database belum sesuai versi aplikasi:\n' +
          problems.map((p) => `  - ${p}`).join('\n') +
          '\nSolusi: jalankan "host:db-init" (hosting: Setup Node.js App → Run JS script) atau "npm run db:init" (lokal), lalu restart.',
      )
    else console.log('Database terhubung dan sesuai versi aplikasi.')
  } catch (err) {
    console.error('Gagal memeriksa skema database:', err.message)
  }
}
