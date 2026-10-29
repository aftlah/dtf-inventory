import crypto from 'node:crypto'

// Penyebab error server yang umum, diterjemahkan jadi pesan yang jelas untuk pengguna.
// Error yang sudah dikenal aplikasi (HttpError, kesalahan input) dikirim apa adanya.
// Error tak terduga: dicatat lengkap di log server dengan kode referensi `ref`, dan pengguna menerima kode yang sama
// sehingga kejadiannya mudah dicari di log. Detail teknis hanya dikirim ke admin.

const DB_DOWN = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EPIPE',
  'PROTOCOL_CONNECTION_LOST',
  'ER_ACCESS_DENIED_ERROR',
  'ER_DBACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
  'ER_CON_COUNT_ERROR',
  'ER_USER_LIMIT_REACHED',
  'ER_SERVER_SHUTDOWN',
])

const SCHEMA = new Set(['ER_BAD_FIELD_ERROR', 'ER_NO_SUCH_TABLE', 'ER_BAD_TABLE_ERROR', 'ER_VIEW_INVALID'])

function classify(err) {
  const code = err?.code
  if (SCHEMA.has(code))
    return {
      status: 500,
      kind: 'SCHEMA_OUTDATED',
      message:
        'Database belum diperbarui ke versi aplikasi ini. Admin: jalankan "host:db-init" di hosting (Setup Node.js App → Run JS script), lalu RESTART.',
    }
  if (DB_DOWN.has(code))
    return {
      status: 503,
      kind: 'DB_UNAVAILABLE',
      message: 'Database tidak bisa dihubungi. Coba lagi sebentar; jika terus terjadi, hubungi admin.',
    }
  if (err?.errno === 1690 || err?.errno === 1264 || code === 'ER_DATA_OUT_OF_RANGE' || code === 'ER_WARN_DATA_OUT_OF_RANGE')
    return {
      status: 500,
      kind: 'NUMBER_RANGE',
      message: 'Ada angka di luar batas saat menghitung. Periksa harga jual dan harga modal barang, lalu coba lagi.',
    }
  if (code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT')
    return { status: 409, kind: 'BUSY', message: 'Sedang ada proses lain pada data yang sama. Coba lagi sebentar.' }
  if (code === 'ER_DUP_ENTRY') return { status: 409, kind: 'DUPLICATE', message: 'Data itu sudah ada.' }
  if (code === 'ER_DATA_TOO_LONG') return { status: 400, kind: 'TOO_LONG', message: 'Ada isian yang terlalu panjang.' }
  if (code === 'ER_NO_REFERENCED_ROW_2' || code === 'ER_ROW_IS_REFERENCED_2')
    return { status: 409, kind: 'REFERENCE', message: 'Data masih dipakai oleh data lain atau tidak ditemukan.' }
  return { status: 500, kind: 'SERVER_ERROR', message: 'Terjadi kesalahan server.' }
}

/** Ubah error menjadi { status, body } untuk respons API, dan catat error tak terduga ke log. */
export function describeError(err, req) {
  // Error yang sengaja dilempar aplikasi (HttpError) atau middleware Express (body terlalu besar / JSON rusak).
  if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 600) {
    let message = err.message
    if (err.type === 'entity.too.large') message = 'Data yang dikirim terlalu besar.'
    else if (err.type === 'entity.parse.failed') message = 'Format data yang dikirim tidak valid.'
    return { status: err.status, body: { error: message } }
  }

  const ref = crypto.randomBytes(3).toString('hex')
  const { status, kind, message } = classify(err)
  const where = `${req?.method ?? '?'} ${String(req?.originalUrl ?? '').split('?')[0]}`
  console.error(`[${ref}] ${kind} ${where} user=${req?.user?.id ?? '-'}`, err)

  const body = { error: message, code: kind, ref }
  if (req?.user?.role === 'admin') body.detail = `${err?.code ?? err?.name ?? 'Error'}: ${err?.message ?? ''}`.slice(0, 300)
  return { status, body }
}
