# DTF Inventory

Website inventory internal, mengikuti struktur dan tampilan `inventory-bbc` (versi inti saja).
Stack: React + Vite + TypeScript + Tailwind v4 + shadcn/ui (Radix) + sonner (client) · Node/Express (server) · **MySQL 8**.

## Fitur

- Login (JWT) dengan role **admin** dan **staff**.
- **Dashboard** — ringkasan, stok menipis, aktivitas terbaru.
- **Stok** — per barang dan per lokasi, penanda stok menipis.
- **Masuk / Keluar / Transfer** — atomik di database; stok tidak bisa minus (baris barang dikunci per transaksi).
- **Riwayat** — semua pergerakan (filter barang/lokasi/tipe), tidak bisa diubah atau dihapus dari aplikasi.
- **Katalog Barang** dan **Lokasi** — kelola oleh admin (hapus = soft delete, hanya bila stok 0).
- **Pengguna** (admin) — tambah akun, ubah role, reset password, nonaktifkan.
- **Profil** — ganti password.

Stok **tidak disimpan sebagai angka**; selalu dihitung dari `inventory_logs` (view `stock_levels`), sama seperti BBC.

## Setup

1. Pastikan MySQL 8 jalan (Laragon: Start All).
2. Salin dan isi `server/.env` dari `server/.env.example` (DB, `JWT_SECRET`, akun admin pertama).
3. Pasang dependensi dan buat database:
   ```bash
   npm run install:all
   npm run db:init      # buat database, tabel, dan admin pertama (aman diulang)
   ```
4. Development (dua terminal):
   ```bash
   npm run dev:server   # API di http://localhost:3001
   npm run dev:client   # web di http://localhost:5173 (proxy /api ke server)
   ```
5. Produksi: `npm run build` lalu `npm start` — server Express menyajikan `client/dist` dan API di satu port.

Ganti password admin dari menu Profil setelah login pertama.

## Branding 

- Nama/subjudul/logo: [client/src/brand.ts](client/src/brand.ts) (taruh logo di `client/public/`).
- Warna: variabel di bagian `:root` [client/src/index.css](client/src/index.css).

## Struktur

```
server/schema.sql            skema MySQL (users, items, locations, inventory_logs, view stock_levels)
server/scripts/init-db.js    buat DB + skema + admin pertama
server/src/routes/           auth, catalog (barang+lokasi), inventory (stok, movements, log, dashboard), users
client/src/pages/            Dashboard, Stock, Movements, Log, Items, Locations, Users, Profile
client/src/components/       ui/ (shadcn), common.tsx (PageHeader, Kpi, OptionSelect, dll), Layout.tsx (sidebar)
```

## Market (beli barang)

Seperti `inventory-bbc`: member memilih barang bergambar, memasukkannya ke keranjang, lalu mengirim pesanan.

- **Role `member`** hanya melihat Market dan pesanannya sendiri. Admin/staff memproses pesanan di menu *Pesanan*.
- Pesanan berstatus **Menunggu**. Stok langsung *dipesankan* (tidak bisa dijual dua kali), tetapi baru keluar dari stok saat disetujui.
- Saat **disetujui**, barang keluar dari lokasi bertanda *Dijual di Market* (stok terbanyak dulu) dan tercatat di Riwayat. **Ditolak/dibatalkan** → stok dilepas; membatalkan pesanan yang sudah disetujui mengembalikan barang ke lokasi asal. Staff tidak boleh menyetujui pesanannya sendiri (kecuali admin).
- Harga disalin ke pesanan, jadi mengubah harga tidak mengubah pesanan lama.
- Atur di **Katalog Barang** (harga, gambar, *Dijual di Market*) dan **Lokasi** (*Dijual di Market*).

Isi katalog dengan senjata, amunisi, dan perlengkapan dari BBC (gambar di `client/public/items/`):

```bash
npm run db:init                       # upgrade skema bila database dibuat dari versi lama
npm run db:seed-market                # katalog + harga (stok 0)
npm run db:seed-market -- --stock     # sekaligus stok awal seperti BBC
```

## Deploy ke cPanel (Setup Node.js App)

1. `npm run build`, lalu zip `server/` (tanpa `node_modules` dan `.env`) + `client/dist/` dengan struktur `dtf/server` dan `dtf/client/dist` (paket jadi: `deploy/dtf-inventory.zip`).
2. cPanel → **MySQL Databases**: buat database + user, beri **ALL PRIVILEGES**. Nama aslinya berawalan akun cPanel (mis. `akun_dtf`).
3. File Manager → upload dan extract zip ke home (`~/dtf/server`, `~/dtf/client/dist`).
4. **Setup Node.js App → Create Application**: Node.js 20/22, Application root `dtf/server`, Startup file `app.cjs`, pilih domain/subdomain. Isi environment variables: `DB_HOST=localhost`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SKIP_CREATE=1`, `JWT_SECRET` (acak), `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NAME`.
5. **Run NPM Install**, lalu jalankan skrip `host:db-init` (buat tabel + admin), dan opsional `host:seed-market`. Terakhir **Restart**.
6. Setelah update kode: build ulang, upload ulang `client/dist` / `server/src`, lalu Restart.

## Penjualan, Pemrosesan, dan Jual Barang

Seperti `inventory-bbc`. Menu sidebar: **Penjualan** (Ajukan Penjualan, Status Penjualan, Jual Barang, Status Jual Barang) dan **Pemrosesan** (Ajukan, Status). Halaman *Ajukan* berbentuk toko bergambar dengan keranjang. Aktifkan per barang di **Katalog Barang → Tersedia untuk**.

- **Penjualan:** member mengajukan barang (ada minimal jumlah) → staff menyetujui (barang keluar dari stok) → member lapor *uang hasil + link bukti* → staff konfirmasi.
- **Pemrosesan:** member mengajukan bahan → staff menyetujui (bahan keluar dari stok) → member lapor *item hasil + link bukti* → staff konfirmasi; hasil masuk ke lokasi bertanda *Dijual di Market*.
- **Jual Barang:** member menjual barang ke toko dengan harga beli tetap → staff menyetujui → barang masuk ke lokasi *Dijual di Market* (tanpa laporan).
- Stok bahan langsung dipesankan saat pengajuan dibuat. Ditolak/dibatalkan melepas pesanan stok. Staff bisa meminta lapor ulang.
- Staff tidak boleh menyetujui/mengonfirmasi pengajuannya sendiri (kecuali admin). Bahan diambil otomatis dari lokasi dengan stok terbanyak.
- Jalankan `npm run db:init` sekali untuk menambah tabel/kolom baru pada database lama, lalu `npm run db:seed-market` untuk mengisi katalog (barang yang sudah ada tidak diubah).

## Buku Kas (keuangan)

Menu **Keuangan → Buku Kas** (admin/staff), seperti `inventory-bbc`:
- Catat **pemasukan** dan **pengeluaran** dengan kategori, sumber/tujuan ("uang keluar ke mana"), tanggal, dan catatan.
- Pemasukan punya **status uang**: kotor → sedang dicuci → bersih (bisa diubah langsung di tabel). Posisi ketiganya selalu dihitung dari semua pemasukan.
- Ringkasan per periode (hari ini / 7 hari / bulan ini / semua / kustom): pemasukan, pengeluaran, saldo, pengeluaran dan pemasukan per kategori.
- Hanya admin yang bisa menghapus catatan (soft delete). Pencatatan manual, terpisah dari pesanan Market.
- Jalankan `npm run db:init` sekali untuk membuat tabel `cash_entries`.

## Notifikasi, Laporan Keuangan, dan Log Aktivitas

- **Notifikasi (lonceng di header):** badge jumlah belum dibaca, daftar terbaru, klik untuk membuka halaman terkait, tandai dibaca. Diperbarui tiap 30 detik. Dibuat oleh server saat: pesanan/pengajuan baru atau dibatalkan, disetujui/ditolak, laporan masuk/dikonfirmasi/diminta ulang, dan stok menipis (sekali per barang sampai dibaca). Pelaku tidak menerima notifikasi atas aksinya sendiri.
  - **Discord (opsional):** isi `DISCORD_WEBHOOK_URL` di `server/.env` (atau environment variable di cPanel) untuk mengirim notifikasi staff ke channel Discord. Dikirim hanya setelah transaksi berhasil.
- **Laporan Keuangan** (Keuangan → Laporan Keuangan): Penjualan = pesanan Market yang disetujui + uang hasil Penjualan yang dilaporkan; Modal = harga modal × qty terjual; Profit = Penjualan − Modal. Juga nilai stok, jumlah dibayar ke member (Jual Barang), rincian per hari, dan barang paling menguntungkan. Isi **Harga modal** tiap barang di Katalog Barang; harga modal disalin ke tiap transaksi, jadi mengubahnya tidak mengubah laporan lama. Hari mengikuti WIB.
- **Log Aktivitas** (Admin → Log Aktivitas): setiap perubahan barang, lokasi, pengguna, pesanan, pengajuan, dan buku kas dicatat (siapa, kapan, nilai lama → baru). Password tidak pernah dicatat. Tidak ada fitur ubah/hapus log dari aplikasi.
- Jalankan `npm run db:init` sekali untuk membuat tabel baru dan kolom harga modal. Waktu di database kini disimpan sebagai UTC (sesi koneksi diatur otomatis).
