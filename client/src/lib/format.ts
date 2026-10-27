import type { LogType, OrderStatus } from './types'

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

export const formatRupiah = (n: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

export const orderStatusLabel: Record<OrderStatus, string> = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  cancelled: 'Dibatalkan',
}
