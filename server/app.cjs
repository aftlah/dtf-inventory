// Startup file untuk cPanel "Setup Node.js App" (Passenger). Passenger memuat file ini dengan require(),
// sedangkan aplikasi memakai ES module, jadi dimuat lewat import() dinamis.
// Variabel lingkungan (DB_*, JWT_SECRET, dst.) diisi dari halaman Setup Node.js App, bukan dari file .env.
import('./src/index.js').catch((err) => {
  console.error(err)
  process.exit(1)
})
