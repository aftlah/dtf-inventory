import mysql from 'mysql2/promise'

export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? 'dtf_inventory',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: false,
  timezone: 'Z',
})

// Semua waktu disimpan dan dibaca sebagai UTC; tampilan mengubahnya ke WIB.
pool.pool.on('connection', (c) => c.query("SET time_zone = '+00:00'"))

export async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

// conn.afterCommit(fn): jalankan fn hanya setelah transaksi berhasil di-commit (mis. kirim Discord).
export async function withTx(fn) {
  const conn = await pool.getConnection()
  const hooks = []
  conn.afterCommit = (hook) => hooks.push(hook)
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    for (const hook of hooks) Promise.resolve().then(hook).catch((e) => console.error(e))
    return result
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.afterCommit = undefined
    conn.release()
  }
}
