export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export function str(value, { field, max, required = false }) {
  const v = typeof value === 'string' ? value.trim() : ''
  if (required && !v) throw new HttpError(400, `${field} wajib diisi`)
  if (v.length > max) throw new HttpError(400, `${field} maksimal ${max} karakter`)
  return v || null
}

export function posInt(value, field, { min = 1 } = {}) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min) throw new HttpError(400, `${field} tidak valid`)
  return n
}

export function duplicateAs(err, message) {
  if (err?.code === 'ER_DUP_ENTRY') return new HttpError(409, message)
  return err
}
