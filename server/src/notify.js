import { pool } from './db.js'
import { TOTAL_STOCK } from './stock.js'

// Notifikasi dalam aplikasi + (opsional) Discord. Set DISCORD_WEBHOOK_URL untuk mengaktifkan Discord.
const DISCORD_URL = process.env.DISCORD_WEBHOOK_URL ?? ''
const APP_URL = process.env.APP_URL ?? ''

async function staffIds(db, exceptId) {
  const [rows] = await db.query(
    `SELECT id FROM users WHERE active = 1 AND role IN ('admin', 'staff') AND id <> ?`,
    [exceptId ?? 0],
  )
  return rows.map((r) => r.id)
}

// Tampilan pesan Discord per jenis notifikasi: ikon di judul dan warna garis embed.
const STYLE = {
  order_new: { icon: '🛒', color: 0xe8803f },
  request_new: { icon: '📦', color: 0x3b82f6 },
  request_reported: { icon: '📝', color: 0xf59e0b },
  low_stock: { icon: '⚠️', color: 0xef4444 },
  account_request: { icon: '👤', color: 0x8b5cf6 },
}
const DEFAULT_STYLE = { icon: '🔔', color: 0x64748b }

export const formatUsd = (n) => `$${Number(n).toLocaleString('en-US')}`

/** Ringkas daftar barang untuk satu kolom embed: "SMG ×2, Box Ammo 9MM ×5 … dan 3 lainnya". */
export function summarizeItems(entries, max = 6) {
  const shown = entries.slice(0, max).map((e) => `${e.name} ×${e.qty}`)
  const rest = entries.length - shown.length
  return shown.join('\n') + (rest > 0 ? `\n… dan ${rest} lainnya` : '')
}

/**
 * Kirim embed ke Discord. payload: { kind, title, body?, description?, link?, fields?: [{ name, value, inline? }] }.
 * `db` boleh koneksi transaksi (kirim setelah commit) atau null/pool (kirim langsung).
 * Nama/teks dari pengguna ikut dikirim, jadi allowed_mentions dikosongkan agar @everyone/@role tidak aktif.
 */
export function sendDiscord(db, { kind, title, body, description, link, fields }) {
  if (!DISCORD_URL) return
  const style = STYLE[kind] ?? DEFAULT_STYLE
  const embed = {
    title: `${style.icon} ${title}`.slice(0, 250),
    color: style.color,
    footer: { text: 'DTF Inventory' },
    timestamp: new Date().toISOString(),
  }
  // Deskripsi hanya bila diberikan eksplisit, atau bila tidak ada kolom (supaya isi kolom tidak diulang di deskripsi).
  const text = description ?? (fields?.length ? undefined : body)
  if (text) embed.description = text.slice(0, 1500)
  if (fields?.length)
    embed.fields = fields.slice(0, 10).map((f) => ({
      name: String(f.name).slice(0, 200),
      value: String(f.value || '—').slice(0, 1000),
      inline: !!f.inline,
    }))
  // Judul bisa diklik bila APP_URL diisi (mis. https://dtf-inventory.aftlah.my.id).
  if (APP_URL && link) embed.url = APP_URL.replace(/\/+$/, '') + link

  const run = () =>
    fetch(DISCORD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
    }).catch((e) => console.error('Discord:', e.message))
  // Dalam transaksi, kirim hanya bila transaksi berhasil di-commit.
  if (db?.afterCommit) db.afterCommit(run)
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
        fields: [
          { name: 'Barang', value: item.name, inline: true },
          { name: 'Sisa', value: `${Number(item.qty)} ${item.unit}`, inline: true },
          { name: 'Minimum', value: String(item.min_stock), inline: true },
        ],
      },
      { discord: true },
    )
  }
}
