// Membuat database + tabel (schema.sql) dan admin pertama. Aman diulang.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const dbName = process.env.DB_NAME ?? 'dtf_inventory'
if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error('DB_NAME tidak valid')

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  multipleStatements: true,
})

await conn.query(
  `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
)
await conn.query(`USE \`${dbName}\``)
await conn.query(fs.readFileSync(path.join(dir, '../schema.sql'), 'utf8'))
console.log(`Skema siap di database "${dbName}"`)

const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM users')
if (n === 0) {
  const username = (process.env.ADMIN_USERNAME ?? 'admin').toLowerCase()
  const password = process.env.ADMIN_PASSWORD ?? ''
  if (password.length < 8) throw new Error('Isi ADMIN_PASSWORD (minimal 8 karakter) di server/.env')
  await conn.query('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)', [
    process.env.ADMIN_NAME ?? 'Administrator',
    username,
    await bcrypt.hash(password, 10),
    'admin',
  ])
  console.log(`Admin dibuat: ${username}`)
}
await conn.end()
