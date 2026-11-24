import { useState, type FormEvent } from 'react'
import { CalendarCheck, Check, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Field, ToneBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { formatClock, formatDayLong, formatDayShort, formatWeekday, shiftDay } from '@/lib/format'
import type { AttendanceDayStatus, AttendanceStatus, MyAttendance } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

// Bagian absensi yang dipakai halaman Absensi dan kartu di dashboard.

export const MAX_AHEAD_DAYS = 14

export const statusLabel: Record<AttendanceStatus | 'absent', string> = {
  present: 'Hadir',
  excused: 'Izin',
  absent: 'Tidak hadir',
}
export const statusTone: Record<AttendanceStatus | 'absent', 'good' | 'warn' | 'bad'> = {
  present: 'good',
  excused: 'warn',
  absent: 'bad',
}

const cellClass: Record<'present' | 'excused' | 'absent' | 'none', string> = {
  present: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/40',
  excused: 'bg-amber-500/20 text-amber-300 ring-amber-500/40',
  absent: 'bg-destructive/20 text-destructive ring-destructive/40',
  none: 'bg-muted/40 text-muted-foreground ring-border',
}

/** Deretan kotak hari (terlama di kiri) berwarna menurut status: hadir, izin, tidak hadir, atau belum ada. */
export function DayStrip({ days, today }: { days: { day: string; status: AttendanceDayStatus }[]; today: string }) {
  const ordered = [...days].reverse() // data dari server: terbaru dulu
  return (
    <ol className="flex gap-1.5" aria-label="Riwayat kehadiran">
      {ordered.map((d) => {
        const key = d.status ?? 'none'
        return (
          <li
            key={d.day}
            title={`${formatDayShort(d.day)} · ${d.status ? statusLabel[d.status] : 'belum ada catatan'}`}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center rounded-lg py-1.5 text-[11px] leading-tight ring-1',
              cellClass[key],
              d.day === today && 'ring-2 ring-primary',
            )}
          >
            <span className="font-medium">{formatWeekday(d.day)}</span>
            <span className="tabular-nums opacity-80">{formatDayShort(d.day).split(' ')[0]}</span>
          </li>
        )
      })}
    </ol>
  )
}

/** Absen hadir hari ini dan ajukan izin. `onDone` dipanggil setelah berhasil (muat ulang data). */
export function useCheckIn(onDone: () => void) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function send(status: AttendanceStatus, opts: { day?: string; note?: string } = {}) {
    setBusy(true)
    try {
      await api('/attendance/check-in', { method: 'POST', body: { status, ...opts } })
      toast.success(status === 'present' ? 'Absen tercatat · kamu masuk kota hari ini' : 'Izin tercatat')
      onDone()
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mencatat absen')
      onDone()
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, hadir: () => send('present'), izin: (day: string, note: string) => send('excused', { day, note }) }
}

/**
 * Dialog izin dengan keterangan wajib. Dengan `today` diisi, ada pilihan tanggal (hari ini sampai 14 hari ke depan);
 * tanpa itu, tanggalnya tetap `fixedDay` (dipakai staff yang mencatat izin untuk seseorang di tanggal terpilih).
 */
export function IzinDialog({
  open,
  title,
  description,
  today,
  initialDay,
  initialNote = '',
  busy,
  onSubmit,
  onClose,
}: {
  open: boolean
  title: string
  description: string
  /** Isi untuk menampilkan pilihan tanggal. */
  today?: string
  initialDay: string
  initialNote?: string
  busy: boolean
  onSubmit: (day: string, note: string) => void
  onClose: () => void
}) {
  const [day, setDay] = useState(initialDay)
  const [note, setNote] = useState(initialNote)
  const [seen, setSeen] = useState(open)
  // Isi ulang tiap kali dialog dibuka.
  if (open !== seen) {
    setSeen(open)
    if (open) {
      setDay(initialDay)
      setNote(initialNote)
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (day && note.trim()) onSubmit(day, note.trim())
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form id="izin-form" onSubmit={submit} className="flex flex-col gap-4">
          {today ? (
            <Field label="Tanggal izin" hint={`Hari ini sampai ${MAX_AHEAD_DAYS} hari ke depan.`}>
              <Input type="date" value={day} min={today} max={shiftDay(today, MAX_AHEAD_DAYS)} onChange={(e) => setDay(e.target.value)} required />
            </Field>
          ) : null}
          <Field label="Keterangan izin" hint="Wajib diisi, mis. alasan tidak bisa masuk kota.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} autoFocus required />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" form="izin-form" disabled={busy || !day || !note.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : null} Simpan izin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Kartu absensi harian: status hari ini dengan tombol absen langsung, deretan 7 hari terakhir, dan tingkat kehadiran.
// Gagal dimuat = kartu tidak tampil; dashboard lainnya tidak terganggu.
export function AttendanceCard() {
  const { data, reload } = useAsync(() => api<MyAttendance>('/attendance/me'), [])
  const { busy, hadir, izin } = useCheckIn(reload)
  const [izinOpen, setIzinOpen] = useState(false)
  if (!data) return null
  const { today, summary, days } = data
  const mine = today.mine
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CalendarCheck className="size-4 text-primary" aria-hidden /> Absensi hari ini
          </span>
          <Link to="/attendance" className="text-xs font-medium text-primary hover:underline">
            Lihat semua
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/30 px-3 py-2.5">
          {mine ? (
            <>
              <ToneBadge tone={statusTone[mine.status]}>{mine.status === 'present' ? 'Masuk kota' : 'Izin'}</ToneBadge>
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                {mine.note ? `${mine.note} · ` : ''}
                {mine.by_staff ? 'dicatat staff' : `dicatat ${formatClock(mine.at)} WIB`}
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1 text-sm text-muted-foreground">Kamu belum absen hari ini ({formatDayLong(today.day)}).</span>
          )}
          {mine?.by_staff ? null : (
            <span className="ml-auto flex gap-2">
              {mine?.status !== 'present' ? (
                <Button size="sm" disabled={busy} onClick={() => void hadir()}>
                  {busy ? <Loader2 className="animate-spin" /> : <Check />} Absen hadir
                </Button>
              ) : null}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setIzinOpen(true)}>
                Izin
              </Button>
            </span>
          )}
        </div>
        <DayStrip days={days.slice(0, 7)} today={today.day} />
        <p className="text-xs text-muted-foreground">
          Tingkat kehadiran {summary.window_days} hari:{' '}
          <span className="font-semibold text-foreground">{summary.percent === null ? '—' : `${summary.percent}%`}</span> ·{' '}
          {summary.present} hadir · {summary.excused} izin · {summary.absent} tidak hadir
        </p>
      </CardContent>
      <IzinDialog
        open={izinOpen}
        title="Ajukan izin"
        description="Tulis alasan kamu tidak bisa masuk kota. Keterangan wajib diisi dan bisa dilihat staff."
        today={today.day}
        initialDay={today.day}
        initialNote={mine?.status === 'excused' ? (mine.note ?? '') : ''}
        busy={busy}
        onSubmit={(day, note) => void izin(day, note).then((ok) => ok && setIzinOpen(false))}
        onClose={() => setIzinOpen(false)}
      />
    </Card>
  )
}

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']

/** Kalender kecil berwarna (minggu mulai Senin): hadir, izin, tidak hadir, atau belum ada data. */
export function DayGrid({ days, today }: { days: { day: string; status: AttendanceDayStatus }[]; today: string }) {
  const ordered = [...days].reverse() // dari server: terbaru dulu
  if (ordered.length === 0) return null
  const lead = (new Date(`${ordered[0].day}T00:00:00Z`).getUTCDay() + 6) % 7 // kolom Senin = 0
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1" aria-label="Kalender kehadiran">
        {Array.from({ length: lead }, (_, i) => (
          <li key={`kosong-${i}`} aria-hidden />
        ))}
        {ordered.map((d) => (
          <li
            key={d.day}
            title={`${formatDayShort(d.day)} · ${d.status ? statusLabel[d.status] : 'belum ada data'}`}
            className={cn(
              'flex aspect-square items-center justify-center rounded-md text-xs tabular-nums ring-1',
              cellClass[d.status ?? 'none'],
              d.day === today && 'ring-2 ring-primary',
            )}
          >
            {Number(d.day.slice(8))}
          </li>
        ))}
      </ol>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-label="Keterangan warna">
        {(['present', 'excused', 'absent', 'none'] as const).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={cn('size-3 rounded-sm ring-1', cellClass[k])} aria-hidden />
            {k === 'none' ? 'Belum ada data' : statusLabel[k]}
          </li>
        ))}
      </ul>
    </div>
  )
}
