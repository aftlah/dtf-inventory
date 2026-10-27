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
