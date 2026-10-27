import type { LogType } from './types'

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
