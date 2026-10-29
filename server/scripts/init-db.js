// Membuat database + tabel (schema.sql), meng-upgrade database lama, dan membuat admin pertama. Aman diulang.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COLUMNS } from '../src/migrations.js'

// Bila gagal, tampilkan penyebab dan solusinya dengan jelas (output ini yang terlihat di "Run JS script" cPanel).
function fail(message, err) {
  console.error(`\nGAGAL: ${message}`)
  if (err) console.error(`Detail teknis: ${err.code ?? err.name}: ${err.message}`)
  process.exit(1)
}

const HINTS = {
  ECONNREFUSED: 'Database tidak bisa dihubungi. Periksa DB_HOST dan DB_PORT, dan pastikan MySQL menyala.',
  ENOTFOUND: 'Alamat database tidak ditemukan. Periksa DB_HOST (di hosting biasanya "localhost").',
  ETIMEDOUT: 'Koneksi ke database kehabisan waktu. Periksa DB_HOST dan DB_PORT.',
  ER_ACCESS_DENIED_ERROR: 'Username atau password database salah. Periksa DB_USER dan DB_PASSWORD.',
  ER_DBACCESS_DENIED_ERROR:
    'User database tidak punya akses ke database ini. Di cPanel: MySQL Databases → tambahkan user ke database dengan "ALL PRIVILEGES". Di hosting isi juga DB_SKIP_CREATE=1.',
  ER_BAD_DB_ERROR: 'Database tidak ditemukan. Periksa DB_NAME (di hosting biasanya berawalan nama akun cPanel).',
  ER_TABLEACCESS_DENIED_ERROR: 'User database tidak punya izin membuat atau mengubah tabel (butuh CREATE dan ALTER).',
  ER_SPECIFIC_ACCESS_DENIED_ERROR: 'User database tidak punya izin yang dibutuhkan (CREATE VIEW / ALTER).',
}

let mysql
let bcrypt
try {
  mysql = (await import('mysql2/promise')).default
  bcrypt = (await import('bcryptjs')).default
} catch (err) {
  fail(
    'paket belum terpasang (folder node_modules hilang).\n' +
      'Solusi: Setup Node.js App → klik "Run NPM Install" sampai selesai, lalu jalankan skrip ini lagi.',
    err,
  )
}

const dir = path.dirname(fileURLToPath(import.meta.url))
const dbName = process.env.DB_NAME ?? 'dtf_inventory'
if (!/^[A-Za-z0-9_$]+$/.test(dbName)) fail('DB_NAME tidak valid (hanya huruf, angka, _ dan $).')

// Di shared hosting (cPanel) database dibuat lewat panel dan user tidak boleh CREATE DATABASE:
// set DB_SKIP_CREATE=1 agar skrip hanya membuat tabel di database yang sudah ada.
const skipCreate = process.env.DB_SKIP_CREATE === '1'

let conn
try {
  conn = await mysql.createConnection({
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
  for (const [table, column, ddl] of COLUMNS) {
    const [rows] = await conn.query(
      'SELECT 1 FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?',
      [dbName, table, column],
    )
    if (rows.length) continue
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`)
    console.log(`+ kolom ${table}.${column}`)
  }
  await conn.query(`ALTER TABLE requests MODIFY kind ENUM('sale','process','buyback') NOT NULL`)
  await conn.query(
    `ALTER TABLE users MODIFY role ENUM('admin','staff','member','highrank') NOT NULL DEFAULT 'staff'`,
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
      if (password.length < 8) fail('ADMIN_PASSWORD minimal 8 karakter.')
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
} catch (err) {
  fail(HINTS[err.code] ?? 'terjadi kesalahan saat menyiapkan database.', err)
} finally {
  await conn?.end().catch(() => {})
}
