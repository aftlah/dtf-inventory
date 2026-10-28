// Mengisi katalog dengan barang Market, Penjualan, Pemrosesan, dan Jual Barang (harga + gambar disalin dari inventory-bbc).
// Aman diulang: barang yang sudah ada (berdasarkan nama) TIDAK diubah, kecuali gambarnya masih kosong.
//   npm run db:seed-market            hanya katalog (stok 0)
//   npm run db:seed-market -- --stock tambah juga stok awal ke lokasi Market (hanya barang yang belum punya riwayat stok)
// Gambar ada di client/public/items/.
import mysql from 'mysql2/promise'

const withStock = process.argv.includes('--stock')

// opsi: price = harga jual Market, market/sale/process/buyback = tersedia di mana, minSale = minimal Penjualan,
// buybackPrice = harga beli toko, stock = stok awal.
const ITEMS = [
  // Senjata
  ['Assault Rifle', 'Senjata', 'assault-rifle', { price: 210000, market: 1, stock: 10 }],
  ['Black Revolver', 'Senjata', 'black-revolver', { price: 93000, market: 1, stock: 10 }],
  ['Ceramic Pistol', 'Senjata', 'ceramic-pistol', { price: 28000, market: 1, stock: 10 }],
  ['KVR', 'Senjata', 'kvr', { price: 81000, market: 1, stock: 10 }],
  ['Machine Pistol', 'Senjata', 'machine-pistol', { price: 30000, market: 1, stock: 10 }],
  ['Micro SMG', 'Senjata', 'micro-smg', { price: 32900, market: 1, stock: 10 }],
  ['Mini SMG', 'Senjata', 'mini-smg', { price: 32900, market: 1, stock: 10 }],
  ['Navy Revolver', 'Senjata', 'navy-revolver', { price: 73500, market: 1, stock: 10 }],
  ['Pistol .50', 'Senjata', 'pistol-50', { price: 12000, market: 1, stock: 10 }],
  ['Pump Shotgun', 'Senjata', 'pump-shotgun', { price: 68000, market: 1, stock: 10 }],
  ['SMG', 'Senjata', 'smg', { price: 42000, market: 1, stock: 9 }],
  ['Virtus', 'Senjata', 'virtus', { price: 240000, market: 1, stock: 8 }],
  ['X17 Modular', 'Senjata', 'x17-modular', { price: 34500, market: 1, stock: 10 }],
  // Ammo
  ['Box Ammo .44 Magnum', 'Ammo', 'box-ammo-44-magnum', { price: 5500, market: 1, stock: 300 }],
  ['Box Ammo .45 ACP', 'Ammo', 'box-ammo-45-acp', { price: 5500, market: 1, stock: 290 }],
  ['Box Ammo .50', 'Ammo', 'box-ammo-50', { price: 1500, market: 1, stock: 500 }],
  ['Box Ammo 9MM', 'Ammo', 'box-ammo-9mm', { price: 4000, market: 1, stock: 455 }],
  ['Box Ammo Rifle 556', 'Ammo', 'box-ammo-rifle-556', { price: 7000, market: 1, stock: 500 }],
  ['Box Ammo Rifle 762', 'Ammo', 'box-ammo-rifle-762', { price: 7000, market: 1, stock: 430 }],
  ['Box Ammo Shotgun', 'Ammo', 'box-ammo-shotgun', { price: 7000, market: 1, stock: 170 }],
  // Perlengkapan
  ['Lockpick', 'Lainnya', 'lockpick', { price: 4000, market: 1, stock: 100 }],
  ['Vest Biru', 'Lainnya', 'vest-biru', { price: 4000, market: 1, stock: 445 }],
  ['Vest Merah', 'Lainnya', 'vest-merah', { price: 1800, market: 1, stock: 75 }],
  // Narko: dijual di Market dan bisa diajukan Penjualan (minimal 1000)
  ['Cocaine Bag', 'Narko', 'cocaine-bag', { price: 800, market: 1, sale: 1, minSale: 1000, stock: 135 }],
  ['Meth Bag', 'Narko', 'meth-bag', { price: 600, market: 1, sale: 1, minSale: 1000, stock: 5390 }],
  ['Opium Bag', 'Narko', 'opium-bag', { price: 600, market: 1, sale: 1, minSale: 1000, stock: 5990 }],
  ['Weed Bag', 'Narko', 'weed-bag', { price: 500, market: 1, sale: 1, minSale: 1000, stock: 6935 }],
  // Spesial: bahan Pemrosesan
  ['Bagging Table', 'Spesial', 'bagging-table', { process: 1, stock: 10 }],
  ['Baggy', 'Spesial', 'baggy', { process: 1, stock: 7000 }],
  ['Meth Cooking Table', 'Spesial', 'meth-cooking-table', { process: 1, stock: 10 }],
  ['Meth Oven', 'Spesial', 'meth-oven', { process: 1, stock: 10 }],
  ['Meth Pax', 'Spesial', 'meth-pax', { process: 1, stock: 0 }],
  ['Weed Daun', 'Spesial', 'weed-daun', { process: 1, stock: 1000 }],
  ['Weed Seed', 'Spesial', 'weed-seed', { process: 1, stock: 900 }],
  // Spesial: dibeli toko dari member (Jual Barang)
  ['Metal Scrap', 'Spesial', 'metal-scrap', { buyback: 1, buybackPrice: 220, stock: 100 }],
  ['Spesial Metal', 'Spesial', 'spesial-metal', { buyback: 1, buybackPrice: 15000, stock: 0 }],
]
// Carbine Rifle di BBC bertanda "tidak dijual" (harga 999.999.999). Dimasukkan ke katalog tapi tidak dijual.
const CARBINE = ['Carbine Rifle', 'Senjata', 'carbine-rifle', {}]

const dbName = process.env.DB_NAME ?? 'dtf_inventory'
const conn = await mysql.createConnection({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: dbName,
})

// Mengembalikan { id, created }. Barang yang sudah ada tidak diubah (hanya mengisi gambar bila kosong).
async function ensureItem(name, category, image, o) {
  const imageUrl = `/items/${image}.png`
  const [[existing]] = await conn.query('SELECT id FROM items WHERE name = ? AND deleted_at IS NULL', [name])
  if (existing) {
    await conn.query('UPDATE items SET image_url = ? WHERE id = ? AND image_url IS NULL', [imageUrl, existing.id])
    return { id: existing.id, created: false }
  }
  const [r] = await conn.query(
    `INSERT INTO items (name, category, unit, image_url, price, in_market, in_sale, in_process, min_sale_qty,
                        in_buyback, buyback_price)
     VALUES (?, ?, 'pcs', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      category,
      imageUrl,
      o.price ?? 0,
      o.market ? 1 : 0,
      o.sale ? 1 : 0,
      o.process ? 1 : 0,
      o.minSale ?? 1,
      o.buyback ? 1 : 0,
      o.buybackPrice ?? 0,
    ],
  )
  return { id: r.insertId, created: true }
}

// Lokasi Market: pakai yang sudah ditandai; kalau belum ada, pakai/buat "Toko".
let [[market]] = await conn.query(
  'SELECT id, name FROM locations WHERE sell_in_market = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1',
)
if (!market) {
  const [[toko]] = await conn.query("SELECT id, name FROM locations WHERE name = 'Toko' AND deleted_at IS NULL")
  if (toko) {
    await conn.query('UPDATE locations SET sell_in_market = 1 WHERE id = ?', [toko.id])
    market = toko
  } else {
    const [r] = await conn.query("INSERT INTO locations (name, kind, sell_in_market) VALUES ('Toko', 'other', 1)")
    market = { id: r.insertId, name: 'Toko' }
  }
  console.log(`Lokasi Market: ${market.name}`)
}

let added = 0
let stocked = 0
for (const [name, category, image, o] of ITEMS) {
  const { id, created } = await ensureItem(name, category, image, o)
  if (created) added++
  if (!withStock || !created || !o.stock) continue
  await conn.query(
    `INSERT INTO inventory_logs (item_id, location_id, type, qty, note, user_name)
     VALUES (?, ?, 'in', ?, 'Stok awal (seed)', 'Sistem')`,
    [id, market.id, o.stock],
  )
  stocked++
}
await ensureItem(...CARBINE)

console.log(
  `${added} barang baru ditambahkan (${ITEMS.length - added} sudah ada, tidak diubah)` +
    (withStock ? `, stok awal untuk ${stocked} barang baru` : ' — stok 0: tambah lewat menu Masuk/Keluar atau jalankan dengan --stock'),
)
await conn.end()
