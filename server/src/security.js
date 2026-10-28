// Pengamanan dasar: header keamanan dan pembatasan percobaan login/ganti password.
// Tanpa dependensi tambahan. Penyimpanan percobaan ada di memori (hilang saat server restart; cukup untuk satu instance).

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // Radix/Tailwind memakai atribut style inline; font Plus Jakarta Sans dari Google Fonts.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  // Gambar barang boleh dari path lokal atau URL https yang diisi admin.
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

export function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  })
  // HSTS hanya bila koneksi benar-benar HTTPS (butuh TRUST_PROXY bila di belakang proxy hosting).
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  next()
}

// Respons API berisi data pribadi/uang: jangan di-cache browser atau proxy.
export function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store')
  next()
}

/**
 * Pembatas percobaan gagal. Setiap kunci punya jendela waktu; melewati `max` kegagalan
 * dalam jendela itu = diblokir sampai jendela berakhir.
 */
export function createLimiter({ windowMs, max }) {
  const hits = new Map() // key -> { count, resetAt }

  const timer = setInterval(() => {
    const now = Date.now()
    for (const [key, v] of hits) if (v.resetAt <= now) hits.delete(key)
  }, 5 * 60 * 1000)
  timer.unref()

  const live = (key) => {
    const v = hits.get(key)
    if (!v) return null
    if (v.resetAt <= Date.now()) {
      hits.delete(key)
      return null
    }
    return v
  }

  return {
    /** Sisa detik blokir, atau 0 bila boleh mencoba. */
    blockedFor(key) {
      const v = live(key)
      return v && v.count >= max ? Math.ceil((v.resetAt - Date.now()) / 1000) : 0
    },
    fail(key) {
      const v = live(key)
      if (v) v.count++
      else hits.set(key, { count: 1, resetAt: Date.now() + windowMs })
    },
    reset(key) {
      hits.delete(key)
    },
  }
}
