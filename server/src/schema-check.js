import { pool } from './db.js'
import { COLUMNS, TABLES, VIEWS } from './migrations.js'

/**
 * Bandingkan database dengan yang dibutuhkan aplikasi. Mengembalikan daftar masalah (kosong = sesuai).
 * Penyebab paling umum: kode baru sudah diunggah tetapi `host:db-init` belum dijalankan (atau gagal).
 */
export async function schemaProblems() {
  const [objects] = await pool.query(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
  )
  const have = new Set(objects.map((o) => o.name))
  const problems = []
  for (const t of TABLES) if (!have.has(t)) problems.push(`tabel "${t}" belum ada`)
  for (const v of VIEWS) if (!have.has(v)) problems.push(`view "${v}" belum ada`)

  const [cols] = await pool.query(
    'SELECT table_name AS t, column_name AS c, column_type AS ct FROM information_schema.columns WHERE table_schema = DATABASE()',
  )
  const haveCols = new Set(cols.map((x) => `${x.t}.${x.c}`))
  for (const [t, c] of COLUMNS) if (have.has(t) && !haveCols.has(`${t}.${c}`)) problems.push(`kolom ${t}.${c} belum ada`)

  const role = cols.find((x) => x.t === 'users' && x.c === 'role')
  if (role && !String(role.ct).includes('highrank')) problems.push('role "highrank" belum ada di tabel users')
  return problems
}
