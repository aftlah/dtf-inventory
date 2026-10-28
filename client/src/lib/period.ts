// Pilihan periode untuk laporan. Tanggal berupa 'YYYY-MM-DD' (null = tanpa batas).
export type Preset = 'today' | 'week' | 'month' | 'all' | 'custom'

export const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Hari ini' },
  { value: 'week', label: '7 hari' },
  { value: 'month', label: 'Bulan ini' },
  { value: 'all', label: 'Semua' },
  { value: 'custom', label: 'Kustom' },
]

export const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function dateRangeFor(preset: Preset, customFrom: string, customTo: string): { from: string | null; to: string | null } {
  const now = new Date()
  switch (preset) {
    case 'today':
      return { from: toYmd(now), to: toYmd(now) }
    case 'week': {
      const start = new Date(now)
      start.setDate(now.getDate() - 6)
      return { from: toYmd(start), to: toYmd(now) }
    }
    case 'month':
      return { from: toYmd(new Date(now.getFullYear(), now.getMonth(), 1)), to: toYmd(now) }
    case 'custom':
      return { from: customFrom || null, to: customTo || null }
    default:
      return { from: null, to: null }
  }
}
