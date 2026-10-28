// Membuat database + tabel (schema.sql), meng-upgrade database lama, dan membuat admin pertama. Aman diulang.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const dbName = process.env.DB_NAME ?? 'dtf_inventory'
if (!/^[A-Za-z0-9_$]+$/.test(dbName)) throw new Error('DB_NAME tidak valid')

// Di shared hosting (cPanel) database dibuat lewat panel dan user tidak boleh CREATE DATABASE:
// set DB_SKIP_CREATE=1 agar skrip hanya membuat tabel di database yang sudah ada.
const skipCreate = process.env.DB_SKIP_CREATE === '1'

const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  ...(skipCreate ? { database: dbName } : {}),
  multipleStatements: true,
})

if (!skipCreate) {
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`,
  )
  await conn.query(`USE \`${dbName}\``)
}
await conn.query(fs.readFileSync(path.join(dir, '../schema.sql'), 'utf8'))

// Upgrade database yang dibuat dari versi skema sebelumnya (CREATE TABLE IF NOT EXISTS tidak menambah kolom).
async function addColumn(table, column, ddl) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
    [dbName, table, column],
  )
  if (rows.length) return
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`)
  console.log(`+ kolom ${table}.${column}`)
}

await addColumn('items', 'price', 'BIGINT UNSIGNED NOT NULL DEFAULT 0')
await addColumn('items', 'image_url', 'VARCHAR(255) NULL')
await addColumn('items', 'in_market', 'TINYINT(1) NOT NULL DEFAULT 0')
await addColumn('locations', 'sell_in_market', 'TINYINT(1) NOT NULL DEFAULT 0')
await addColumn('items', 'in_sale', 'TINYINT(1) NOT NULL DEFAULT 0')
await addColumn('items', 'in_process', 'TINYINT(1) NOT NULL DEFAULT 0')
await addColumn('items', 'min_sale_qty', 'INT UNSIGNED NOT NULL DEFAULT 1')
await addColumn('items', 'in_buyback', 'TINYINT(1) NOT NULL DEFAULT 0')
await addColumn('items', 'buyback_price', 'BIGINT UNSIGNED NOT NULL DEFAULT 0')
await addColumn('items', 'cost_price', 'BIGINT UNSIGNED NOT NULL DEFAULT 0')
await addColumn('order_items', 'cost', 'BIGINT UNSIGNED NOT NULL DEFAULT 0')
await addColumn('request_items', 'cost', 'BIGINT UNSIGNED NOT NULL DEFAULT 0')
await addColumn('requests', 'total', 'BIGINT UNSIGNED NOT NULL DEFAULT 0')
await addColumn('request_items', 'price', 'BIGINT UNSIGNED NOT NULL DEFAULT 0')
await conn.query(`ALTER TABLE requests MODIFY kind ENUM('sale','process','buyback') NOT NULL`)
await addColumn('cash_entries', 'ref_type', 'VARCHAR(20) NULL')
await addColumn('cash_entries', 'ref_id', 'BIGINT UNSIGNED NULL')
await addColumn('inventory_logs', 'ref_type', 'VARCHAR(20) NULL')
await addColumn('inventory_logs', 'ref_id', 'BIGINT UNSIGNED NULL')
await addColumn('orders', 'paid', 'TINYINT(1) NOT NULL DEFAULT 0')
await addColumn('orders', 'paid_at', 'TIMESTAMP NULL')
await addColumn('orders', 'paid_by_name', 'VARCHAR(100) NULL')
await conn.query(
  `ALTER TABLE users MODIFY role ENUM('admin','staff','member') NOT NULL DEFAULT 'staff'`,
)

console.log(`Skema siap di database "${dbName}"`)

const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM users')
if (n === 0) {
  const password = process.env.ADMIN_PASSWORD ?? ''
  if (!password) {
    // Admin boleh dimasukkan manual ke tabel users (mis. lewat phpMyAdmin): lihat `npm run hash-password`.
    console.log(
      'Belum ada pengguna dan ADMIN_PASSWORD kosong, jadi admin tidak dibuat otomatis.\n' +
        'Buat hash password lalu masukkan ke tabel users: npm run hash-password -- "PasswordBaru"',
    )
  } else {
    if (password.length < 8) throw new Error('ADMIN_PASSWORD minimal 8 karakter')
    const username = (process.env.ADMIN_USERNAME ?? 'admin').toLowerCase()
    await conn.query('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)', [
      process.env.ADMIN_NAME ?? 'Administrator',
      username,
      await bcrypt.hash(password, 10),
      'admin',
    ])
    console.log(`Admin dibuat: ${username}`)
  }
}
await conn.end()
