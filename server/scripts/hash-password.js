// Membuat hash bcrypt untuk password, lalu mencetak SQL INSERT untuk akun admin pertama.
// Dipakai bila admin dimasukkan manual ke database (mis. lewat phpMyAdmin) alih-alih lewat ADMIN_PASSWORD.
//   npm run hash-password -- "PasswordBaru"
// Jalankan di komputermu sendiri (bukan di hosting). Password tidak disimpan di mana pun.
import bcrypt from 'bcryptjs'

const password = process.argv[2]
if (!password || password.length < 8) {
  console.error('Pemakaian: npm run hash-password -- "PasswordBaru"   (minimal 8 karakter)')
  process.exit(1)
}

const hash = await bcrypt.hash(password, 10)
console.log(`
Jalankan SQL ini di phpMyAdmin (tab SQL, database aplikasi), sesudah tabel dibuat oleh host:db-init:

INSERT INTO users (name, username, password_hash, role)
VALUES ('Administrator', 'admin', '${hash}', 'admin');
`)
