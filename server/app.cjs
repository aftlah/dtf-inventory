// Startup file untuk cPanel "Setup Node.js App" (Passenger). Passenger memuat file ini dengan require(),
// sedangkan aplikasi memakai ES module, jadi dimuat lewat import() dinamis.
// Variabel lingkungan (DB_*, JWT_SECRET, dst.) diisi dari halaman Setup Node.js App, bukan dari file .env.
import('./src/index.js').catch((err) => {
  // Gagal start = halaman 503. Tulis penyebabnya dengan jelas ke stderr.log sebelum keluar.
  console.error('GAGAL MENJALANKAN APLIKASI:', err && err.message ? err.message : err)
  if (err && (err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'MODULE_NOT_FOUND'))
    console.error('Penyebab: paket belum terpasang (folder node_modules hilang). Solusi: Setup Node.js App → "Run NPM Install", lalu RESTART.')
  else if (err && err.code === 'ERR_REQUIRE_ESM')
    console.error('Penyebab: versi Node.js terlalu lama. Pilih Node.js 20 atau lebih baru di Setup Node.js App.')
  console.error(err)
  process.exit(1)
})
