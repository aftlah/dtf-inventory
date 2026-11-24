import type { LogType, OrderStatus, RequestKind, RequestStatus } from './types'

export const formatNumber = (n: number) => new Intl.NumberFormat('id-ID').format(n)

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso))
}

export const logTypeLabel: Record<LogType, string> = {
  in: 'Masuk',
  out: 'Keluar',
  transfer_in: 'Transfer masuk',
  transfer_out: 'Transfer keluar',
}

export const locationKinds: Record<string, string> = {
  warehouse: 'Gudang',
  stash: 'Brankas',
  vehicle: 'Kendaraan',
  other: 'Lainnya',
}

export const formatMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

// Pesanan Market langsung aktif tanpa persetujuan ("approved"); "Menunggu" hanya untuk pesanan lama.
export const orderStatusLabel: Record<OrderStatus, string> = {
  pending: 'Menunggu',
  approved: 'Diproses',
  rejected: 'Ditolak',
  cancelled: 'Dibatalkan',
}

export const requestStatusLabel: Record<RequestStatus, string> = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  reported: 'Dilaporkan',
  completed: 'Selesai',
  rejected: 'Ditolak',
  cancelled: 'Dibatalkan',
}

export const requestKindLabel: Record<RequestKind, string> = {
  sale: 'Penjualan',
  process: 'Pemrosesan',
  buyback: 'Jual Barang',
}

// 'YYYY-MM-DD' (tanggal murni, tanpa zona waktu) -> "28 Okt 2026".
export function formatDate(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(y, m - 1, d))
}

// Tanggal absensi dipertukarkan sebagai 'YYYY-MM-DD' (tanggal WIB). Dihitung di zona UTC supaya tidak bergeser hari.
const dayFmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('id-ID', { ...opts, timeZone: 'UTC' })
const dayDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`)
/** "Senin, 24 Nov 2026" */
export const formatDayLong = (ymd: string) => dayFmt({ weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }).format(dayDate(ymd))
/** "24 Nov" */
export const formatDayShort = (ymd: string) => dayFmt({ day: 'numeric', month: 'short' }).format(dayDate(ymd))
/** "Sen" */
export const formatWeekday = (ymd: string) => dayFmt({ weekday: 'short' }).format(dayDate(ymd))
/** Geser tanggal 'YYYY-MM-DD' sebanyak n hari. */
export const shiftDay = (ymd: string, n: number) => new Date(dayDate(ymd).getTime() + n * 86400000).toISOString().slice(0, 10)
/** Jam menurut WIB, mis. "21.05". */
export const formatClock = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date(iso))
