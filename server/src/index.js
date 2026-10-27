import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { requireAdmin, requireAuth } from './auth.js'
import { authRouter } from './routes/auth.js'
import { catalogRouter } from './routes/catalog.js'
import { inventoryRouter } from './routes/inventory.js'
import { usersRouter } from './routes/users.js'

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '100kb' }))

app.use('/api/auth', authRouter)
app.use('/api/users', requireAuth, requireAdmin, usersRouter)
app.use('/api', requireAuth, catalogRouter, inventoryRouter)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan' }))

// Produksi: sajikan hasil build frontend (client/dist) dengan fallback SPA.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.use((req, res, next) =>
    req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next(),
  )
}

app.use((err, _req, res, _next) => {
  if (!err.status) console.error(err)
  const status = err.status ?? 500
  res.status(status).json({ error: status === 500 ? 'Terjadi kesalahan server' : err.message })
})

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => console.log(`DTF Inventory API di http://localhost:${port}`))
