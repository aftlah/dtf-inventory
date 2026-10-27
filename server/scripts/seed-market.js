// Mengisi katalog Market dengan senjata, amunisi, dan perlengkapan (harga + gambar disalin dari inventory-bbc).
// Aman diulang: barang diperbarui berdasarkan nama.
//   npm run db:seed-market            hanya katalog (stok 0)
//   npm run db:seed-market -- --stock tambah juga stok awal ke lokasi Market (hanya barang yang belum punya riwayat stok)
// Gambar ada di client/public/items/.
import mysql from 'mysql2/promise'

const withStock = process.argv.includes('--stock')

// [nama, kategori, gambar, harga, stok awal]
const ITEMS = [
  ['Assault Rifle', 'Senjata', 'assault-rifle', 210000, 10],
  ['Black Revolver', 'Senjata', 'black-revolver', 93000, 10],
  ['Ceramic Pistol', 'Senjata', 'ceramic-pistol', 28000, 10],
  ['KVR', 'Senjata', 'kvr', 81000, 10],
  ['Machine Pistol', 'Senjata', 'machine-pistol', 30000, 10],
  ['Micro SMG', 'Senjata', 'micro-smg', 32900, 10],
  ['Mini SMG', 'Senjata', 'mini-smg', 32900, 10],
  ['Navy Revolver', 'Senjata', 'navy-revolver', 73500, 10],
  ['Pistol .50', 'Senjata', 'pistol-50', 12000, 10],
  ['Pump Shotgun', 'Senjata', 'pump-shotgun', 68000, 10],
  ['SMG', 'Senjata', 'smg', 42000, 9],
  ['Virtus', 'Senjata', 'virtus', 240000, 8],
  ['X17 Modular', 'Senjata', 'x17-modular', 34500, 10],
  ['Box Ammo .44 Magnum', 'Ammo', 'box-ammo-44-magnum', 5500, 300],
  ['Box Ammo .45 ACP', 'Ammo', 'box-ammo-45-acp', 5500, 290],
  ['Box Ammo .50', 'Ammo', 'box-ammo-50', 1500, 500],
  ['Box Ammo 9MM', 'Ammo', 'box-ammo-9mm', 4000, 455],
  ['Box Ammo Rifle 556', 'Ammo', 'box-ammo-rifle-556', 7000, 500],
  ['Box Ammo Rifle 762', 'Ammo', 'box-ammo-rifle-762', 7000, 430],
  ['Box Ammo Shotgun', 'Ammo', 'box-ammo-shotgun', 7000, 170],
  ['Lockpick', 'Lainnya', 'lockpick', 4000, 100],
  ['Vest Biru', 'Lainnya', 'vest-biru', 4000, 445],
  ['Vest Merah', 'Lainnya', 'vest-merah', 1800, 75],
]
// Carbine Rifle di BBC bertanda "tidak dijual" (harga 999.999.999). Dimasukkan ke katalog tapi tidak masuk Market.
const CARBINE = ['Carbine Rifle', 'Senjata', 'carbine-rifle']

const dbName = process.env.DB_NAME ?? 'dtf_inventory'
const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: dbName,
})

async function upsertItem(name, category, image, price, inMarket) {
  const imageUrl = `/items/${image}.png`
  const [[existing]] = await conn.query('SELECT id FROM items WHERE name = ? AND deleted_at IS NULL', [name])
  if (existing) {
    await conn.query(
      'UPDATE items SET category = ?, image_url = ?, price = ?, in_market = ? WHERE id = ?',
      [category, imageUrl, price, inMarket, existing.id],
    )
    return existing.id
  }
  const [r] = await conn.query(
    'INSERT INTO items (name, category, unit, image_url, price, in_market) VALUES (?, ?, ?, ?, ?, ?)',
    [name, category, 'pcs', imageUrl, price, inMarket],
  )
  return r.insertId
}

// Lokasi Market: pakai yang sudah ditandai; kalau belum ada, buat "Toko".
let [[market]] = await conn.query(
  'SELECT id, name FROM locations WHERE sell_in_market = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1',
)
if (!market) {
  const [[toko]] = await conn.query("SELECT id, name FROM locations WHERE name = 'Toko' AND deleted_at IS NULL")
  if (toko) {
    await conn.query('UPDATE locations SET sell_in_market = 1 WHERE id = ?', [toko.id])
    market = toko
  } else {
    const [r] = await conn.query(
      "INSERT INTO locations (name, kind, sell_in_market) VALUES ('Toko', 'other', 1)",
    )
    market = { id: r.insertId, name: 'Toko' }
  }
  console.log(`Lokasi Market: ${market.name}`)
}

let stocked = 0
for (const [name, category, image, price, stock] of ITEMS) {
  const id = await upsertItem(name, category, image, price, 1)
  if (!withStock) continue
  const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM inventory_logs WHERE item_id = ?', [id])
  if (n === 0 && stock > 0) {
    await conn.query(
      `INSERT INTO inventory_logs (item_id, location_id, type, qty, note, user_name)
       VALUES (?, ?, 'in', ?, 'Stok awal (seed Market)', 'Sistem')`,
      [id, market.id, stock],
    )
    stocked++
  }
}
await upsertItem(...CARBINE, 0, 0)

console.log(`${ITEMS.length} barang Market siap${withStock ? `, stok awal ditambahkan untuk ${stocked} barang` : ' (stok 0 — tambah lewat menu Masuk/Keluar atau jalankan dengan --stock)'}`)
await conn.end()
