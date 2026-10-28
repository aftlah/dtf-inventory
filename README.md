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
4. **Setup Node.js App → Create Application**: Node.js 20/22, mode Production, Application root `dtf/server`, Startup file `app.cjs`, pilih domain/subdomain (di root, bukan path). Isi environment variables: `DB_HOST=localhost`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SKIP_CREATE=1`, `JWT_SECRET` (acak, ≥16 karakter), **`TRUST_PROXY=1`**, dan opsional `DISCORD_WEBHOOK_URL`. (`ADMIN_USERNAME`/`ADMIN_PASSWORD`/`ADMIN_NAME` bersifat opsional, lihat langkah 6.)
5. **Run NPM Install**, lalu jalankan skrip `host:db-init` (buat/upgrade tabel + admin pertama; aman diulang), dan opsional `host:seed-market`. Terakhir **Restart**.
6. **Admin pertama** (pilih salah satu): (a) buat manual di database: di komputermu, folder `server`, jalankan `npm run hash-password -- "PasswordBaru"`, lalu tempel SQL yang tercetak ke phpMyAdmin (tab SQL, database aplikasi); atau (b) isi `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NAME` sebelum `host:db-init` agar dibuat otomatis (hanya bila tabel `users` masih kosong). Cara (a) membuat password admin tidak tersimpan di environment variable.
7. Setelah update kode: build ulang, upload ulang `client/dist` / `server/src`, jalankan `host:db-init` bila ada tabel/kolom baru, lalu Restart.

**Jangan pernah menaruh password atau kredensial di file yang ikut ke git** (termasuk `.env.example` dan komentarnya). Simpan hanya di environment variable cPanel atau `server/.env` (sudah di-.gitignore).

### Pengamanan bawaan

- Login dibatasi: 8 percobaan gagal per 15 menit untuk kombinasi IP + username (30 per IP), dan 8 untuk ganti password per akun. Disimpan di memori (hilang saat server restart). Respons 429 menampilkan lama tunggu.
- Header keamanan (CSP, X-Frame-Options, nosniff, Referrer-Policy, HSTS saat HTTPS) dan `Cache-Control: no-store` untuk semua respons API.
- Isi `TRUST_PROXY=1` di hosting agar IP asli pengguna terbaca; tanpa itu semua pengguna tampak berasal dari IP proxy yang sama dan pembatas login bisa memblokir semua orang sekaligus.

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

## Dashboard member

Member (role `member`) masuk ke dashboard pribadi di `/`: pesanan menunggu, total belum dibayar, pengajuan yang perlu dilaporkan, belanja minggu ini, jalan pintas (Market, Ajukan Penjualan, Jual Barang, Ajukan Pemrosesan), daftar **Perlu tindakanmu**, aktivitas terbaru, dan **leaderboard mingguan** (Top Spender = belanja Market yang disetujui; Top Seller = uang Penjualan yang dilaporkan + Jual Barang yang selesai; Senin–Minggu WIB). Data dari `GET /api/me/dashboard`.

### Pemasukan otomatis dari pesanan

Saat staff menandai pesanan Market **sudah dibayar**, server otomatis mencatat pemasukan di Buku Kas (kategori *Penjualan Market*, status uang *kotor*, bertanda **Otomatis**, tidak ganda walau ditandai berkali-kali). Menandai **belum dibayar** menghapus catatan itu. Pesanan yang sudah lunas lalu dibatalkan **tidak** otomatis membuat pengeluaran pengembalian dana: catat manual di Buku Kas. Pesanan yang ditandai lunas sebelum fitur ini ada tidak punya catatan kas otomatis.

## Pengajuan akun dari halaman login

Halaman login punya tautan **Ajukan akun**. Pemohon mengisi nama, username, dan password sendiri; akun **belum aktif** sampai admin menyetujui.

- Admin menerima notifikasi (lonceng, dan Discord bila `DISCORD_WEBHOOK_URL` diisi) dan melihat daftarnya di **Pengguna → Permintaan akun**. Admin memilih role (**Member** atau **Staff**) lalu **Setujui** atau **Tolak**. Admin tidak bisa dibuat lewat jalur ini.
- Password pemohon disimpan sebagai hash bcrypt dan dipakai apa adanya saat disetujui; tidak pernah disimpan polos.
- Pengaman anti-spam: maksimal 5 kiriman per jam per IP (isi `TRUST_PROXY=1` di hosting agar IP asli terbaca), maksimal 100 permintaan yang menunggu, satu permintaan menunggu per username, username tidak boleh sudah dipakai, dan kolom jebakan untuk bot.
- Tercatat di Log Aktivitas (Ajukan akun, Akun disetujui, Akun ditolak).
- Jalankan `host:db-init` (atau `db:init` lokal) sekali untuk membuat tabel `account_requests`.

Saat pemohon mencoba login sebelum akunnya diproses dan **password-nya benar**, halaman login menampilkan pesan status ("Akunmu belum disetujui admin..." berwarna kuning, atau "Permintaan akunmu ditolak admin..." berwarna merah) alih-alih "Username atau password salah". Bila password salah atau username tidak dikenal, pesannya tetap generik, supaya orang lain tidak bisa menebak username yang sedang menunggu persetujuan.

### Notifikasi Discord

Bila `DISCORD_WEBHOOK_URL` diisi, pesan dikirim ke channel untuk: pesanan Market baru, pengajuan Penjualan/Pemrosesan/Jual Barang baru, laporan hasil yang menunggu konfirmasi, stok menipis, dan **permintaan akun baru**. Semua pesan memakai `allowed_mentions` kosong, jadi teks dari pengguna (mis. nama pemohon `@everyone`) tidak bisa memicu notifikasi massal. Pesan tidak memuat password atau IP.

#### Tampilan pesan Discord

Pesan dikirim sebagai **embed**: judul berikon dan berwarna menurut jenisnya (🛒 pesanan oranye, 📦 pengajuan biru, 📝 laporan kuning, ⚠️ stok menipis merah, 👤 permintaan akun ungu), kolom rapi (pembeli/pemohon, total, daftar barang, bukti, dan seterusnya), serta waktu dan footer. Isi `APP_URL` (mis. `https://dtf-inventory.aftlah.my.id`) agar judul pesan bisa diklik dan membuka halaman terkait di aplikasi.

## Role Highrank dan batas beli

Role **highrank** punya akses sama seperti member (hanya Market dan pesanannya sendiri), tetapi batas belinya berbeda. Batas diatur per barang di menu Katalog Barang (aktifkan Market, lalu isi *Maks. beli Member* dan *Maks. beli Highrank*). Batas berlaku **per pesanan**; kosong berarti tanpa batas, dan admin/staff tidak dibatasi. Server menolak pesanan yang melebihi batas, dan tampilan Market membatasi jumlah serta menampilkan "Maks. N per pesanan".

Setelah memperbarui kode di hosting, jalankan `host:db-init` sekali (menambah role dan dua kolom batas beli).
