import { pool } from './db.js'
import { TOTAL_STOCK } from './stock.js'

// Notifikasi dalam aplikasi + (opsional) Discord. Set DISCORD_WEBHOOK_URL untuk mengaktifkan Discord.
const DISCORD_URL = process.env.DISCORD_WEBHOOK_URL ?? ''

async function staffIds(db, exceptId) {
  const [rows] = await db.query(
    `SELECT id FROM users WHERE active = 1 AND role IN ('admin', 'staff') AND id <> ?`,
    [exceptId ?? 0],
  )
  return rows.map((r) => r.id)
}

function sendDiscord(db, { title, body }) {
  if (!DISCORD_URL) return
  const content = `**${title}**${body ? `\n${body}` : ''}`.slice(0, 1900)
  const run = () =>
    fetch(DISCORD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }).catch((e) => console.error('Discord:', e.message))
  // Dalam transaksi, kirim hanya bila transaksi berhasil di-commit.
  if (db.afterCommit) db.afterCommit(run)
  else void run()
}

/** Kirim ke satu atau beberapa pengguna tertentu (mis. pemilik pesanan). */
export async function notifyUsers(db = pool, userIds, { kind, title, body, link, ref }) {
  const ids = [...new Set(userIds)].filter(Boolean)
  if (!ids.length) return
  await db.query('INSERT INTO notifications (user_id, kind, title, body, link, ref) VALUES ?', [
    ids.map((id) => [id, kind, title.slice(0, 150), body?.slice(0, 500) ?? null, link ?? null, ref ?? null]),
  ])
}

/** Kirim ke semua admin/staff aktif kecuali pelaku sendiri. */
export async function notifyStaff(db = pool, actor, payload, { discord = false } = {}) {
  await notifyUsers(db, await staffIds(db, actor?.id), payload)
  if (discord) sendDiscord(db, payload)
}

/**
 * Setelah stok berkurang: beri tahu staff bila barang sudah di bawah/sama dengan stok minimum.
 * Tidak mengirim ulang selama notifikasi stok menipis barang itu belum dibaca.
 */
export async function notifyLowStock(db = pool, itemIds) {
  const ids = [...new Set(itemIds)]
  if (!ids.length) return
  const [items] = await db.query(
    `SELECT i.id, i.name, i.unit, i.min_stock, ${TOTAL_STOCK} AS qty
       FROM items i WHERE i.id IN (?) AND i.deleted_at IS NULL AND i.min_stock > 0`,
    [ids],
  )
  for (const item of items) {
    if (Number(item.qty) > item.min_stock) continue
    const ref = `item:${item.id}`
    const [open] = await db.query(
      `SELECT 1 FROM notifications WHERE kind = 'low_stock' AND ref = ? AND read_at IS NULL LIMIT 1`,
      [ref],
    )
    if (open.length) continue
    await notifyStaff(
      db,
      null,
      {
        kind: 'low_stock',
        title: `Stok menipis: ${item.name}`,
        body: `Sisa ${Number(item.qty)} ${item.unit} (minimum ${item.min_stock})`,
        link: '/stock',
        ref,
      },
      { discord: true },
    )
  }
}
