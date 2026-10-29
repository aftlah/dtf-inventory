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
