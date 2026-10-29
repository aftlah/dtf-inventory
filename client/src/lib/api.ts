const TOKEN_KEY = 'dtf-inv-token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // penyimpanan diblokir: sesi hanya berlaku sampai halaman ditutup
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Pesan error yang jelas untuk pengguna. Server mengirim { error, ref?, detail? }: `ref` adalah kode untuk mencari
 * kejadian di log server, `detail` (khusus admin) berisi penyebab teknisnya. Bila respons bukan JSON
 * (mis. halaman 503 dari hosting saat aplikasi mati), pesannya dibuat dari kode status.
 */
function errorMessage(status: number, data: { error?: string; ref?: string; detail?: string } | null): string {
  if (data?.error) {
    let msg = data.error
    if (data.ref) msg += ` (kode: ${data.ref})`
    if (data.detail) msg += `\n${data.detail}`
    return msg
  }
  if (status === 502 || status === 503 || status === 504)
    return `Server sedang tidak tersedia (${status}). Coba lagi sebentar lagi; jika terus terjadi, hubungi admin.`
  if (status === 404) return 'Data atau halaman yang diminta tidak ditemukan.'
  if (status === 413) return 'Data yang dikirim terlalu besar.'
  if (status === 429) return 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.'
  return `Terjadi kesalahan (kode ${status}). Coba lagi; jika terus terjadi, hubungi admin.`
}

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = getToken()
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Tidak bisa terhubung ke server. Periksa koneksi internet-mu lalu coba lagi.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/auth/login')) onUnauthorized?.()
    throw new ApiError(res.status, errorMessage(res.status, data))
  }
  return data as T
}
