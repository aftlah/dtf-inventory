import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { CalendarCheck, Camera, Check, ImageOff, ImagePlus, Loader2 } from 'lucide-react'
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
import { api, apiBlob } from '@/lib/api'
import { formatClock, formatDayLong, formatDayShort, formatWeekday, shiftDay } from '@/lib/format'
import { preparePhoto, type PreparedPhoto } from '@/lib/photo'
import type { AttendanceDayStatus, AttendanceMine, AttendanceStatus, MyAttendance } from '@/lib/types'
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

/* ---------- Foto absen ---------- */

/** Foto absen yang dilindungi login: diambil dengan token lalu ditampilkan lewat object URL. */
export function AuthPhoto({ id, size = 'thumb', alt = 'Foto absen', className }: { id: number; size?: 'thumb' | 'full'; alt?: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    let created: string | null = null
    setUrl(null)
    setFailed(false)
    apiBlob(`/attendance/photo/${id}?size=${size}`)
      .then((blob) => {
        if (!alive) return
        created = URL.createObjectURL(blob)
        setUrl(created)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [id, size])

  if (failed)
    return (
      <span className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)} title="Foto tidak tersedia">
        <ImageOff className="size-4" aria-hidden />
      </span>
    )
  if (!url) return <span className={cn('block animate-pulse bg-muted', className)} aria-hidden />
  return <img src={url} alt={alt} className={cn('object-cover', className)} />
}

/** Foto kecil yang bisa diklik untuk melihat foto penuh. */
export function PhotoThumb({ id, title, subtitle, className }: { id: number; title: string; subtitle?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Lihat foto absen: ${title}`}
        className="shrink-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <AuthPhoto id={id} className={cn('size-11 rounded-lg', className)} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={subtitle ? undefined : 'sr-only'}>{subtitle ?? 'Foto absen'}</DialogDescription>
          </DialogHeader>
          {open ? <AuthPhoto id={id} size="full" alt={`Foto absen: ${title}`} className="max-h-[70vh] min-h-40 w-full rounded-lg bg-black/30 object-contain" /> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Dialog pilih foto untuk absen hadir. Foto dari galeri/kamera, atau tempel screenshot (Ctrl+V). */
function PhotoDialog({ open, busy, onSubmit, onClose }: { open: boolean; busy: boolean; onSubmit: (p: PreparedPhoto) => void; onClose: () => void }) {
  const [prepared, setPrepared] = useState<PreparedPhoto | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [seen, setSeen] = useState(open)
  // Kosongkan tiap kali dialog dibuka.
  if (open !== seen) {
    setSeen(open)
    if (open) {
      setPrepared(null)
      setError(null)
    }
  }

  async function pick(file: File | null | undefined) {
    if (!file) return
    setWorking(true)
    setError(null)
    try {
      setPrepared(await preparePhoto(file))
    } catch (e) {
      setPrepared(null)
      setError(e instanceof Error ? e.message : 'Foto tidak bisa dibaca.')
    } finally {
      setWorking(false)
    }
  }

  // Tempel screenshot dari clipboard selama dialog terbuka.
  useEffect(() => {
    if (!open) return
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (file) {
        e.preventDefault()
        void pick(file)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [open])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void pick(e.dataTransfer.files[0])
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Foto absen</DialogTitle>
          <DialogDescription>
            Absen hadir harus menyertakan foto. Ambil foto atau pilih screenshot. Di komputer kamu juga bisa menempelnya dengan Ctrl+V.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            void pick(e.target.files?.[0])
            e.target.value = '' // boleh memilih berkas yang sama lagi
          }}
        />

        {prepared ? (
          <div className="flex flex-col gap-3">
            <img src={prepared.preview} alt="Pratinjau foto absen" className="max-h-72 w-full rounded-xl bg-black/30 object-contain" />
            <Button type="button" variant="outline" size="sm" className="self-start" disabled={busy || working} onClick={() => inputRef.current?.click()}>
              <ImagePlus /> Ganti foto
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            disabled={working}
            className={cn(
              'flex h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              dragging ? 'border-primary bg-primary/10' : 'border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/40',
            )}
          >
            {working ? <Loader2 className="size-7 animate-spin text-primary" aria-hidden /> : <Camera className="size-7 text-primary" aria-hidden />}
            <span className="font-medium">{working ? 'Memproses foto…' : 'Pilih atau ambil foto'}</span>
            <span className="text-xs text-muted-foreground">atau seret dan lepas foto di sini</span>
          </button>
        )}
        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button disabled={!prepared || busy || working} onClick={() => prepared && onSubmit(prepared)}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />} Kirim absen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- Alur absen ---------- */

/**
 * Absen hadir (wajib berfoto) dan ajukan izin (wajib berketerangan). Memegang keadaan kedua dialog, supaya halaman
 * cukup memanggil openHadir/openIzin dan memasang <CheckInDialogs>. `onDone` dipanggil setelah selesai (muat ulang data).
 */
export function useCheckIn(onDone: () => void) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [hadirOpen, setHadirOpen] = useState(false)
  const [izinOpen, setIzinOpen] = useState(false)

  async function send(body: Record<string, unknown>, okText: string) {
    setBusy(true)
    try {
      await api('/attendance/check-in', { method: 'POST', body })
      toast.success(okText)
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

  return {
    busy,
    hadirOpen,
    izinOpen,
    openHadir: () => setHadirOpen(true),
    openIzin: () => setIzinOpen(true),
    closeHadir: () => setHadirOpen(false),
    closeIzin: () => setIzinOpen(false),
    sendHadir: async (p: PreparedPhoto) => {
      if (await send({ status: 'present', photo: p.photo, thumb: p.thumb }, 'Absen tercatat · kamu masuk kota hari ini')) setHadirOpen(false)
    },
    sendIzin: async (day: string, note: string) => {
      if (await send({ status: 'excused', day, note }, 'Izin tercatat')) setIzinOpen(false)
    },
  }
}
export type CheckInCtl = ReturnType<typeof useCheckIn>

/** Dialog foto (absen hadir) dan dialog izin untuk satu `useCheckIn`. */
export function CheckInDialogs({ ctl, today, mine }: { ctl: CheckInCtl; today: string; mine: AttendanceMine | null }) {
  return (
    <>
      <PhotoDialog open={ctl.hadirOpen} busy={ctl.busy} onSubmit={(p) => void ctl.sendHadir(p)} onClose={ctl.closeHadir} />
      <IzinDialog
        open={ctl.izinOpen}
        title="Ajukan izin"
        description="Tulis alasan kamu tidak bisa masuk kota. Keterangan wajib diisi dan bisa dilihat staff. Bisa juga untuk hari lain (sampai 14 hari ke depan)."
        today={today}
        initialDay={today}
        initialNote={mine?.status === 'excused' ? (mine.note ?? '') : ''}
        busy={ctl.busy}
        onSubmit={(day, note) => void ctl.sendIzin(day, note)}
        onClose={ctl.closeIzin}
      />
    </>
  )
}

/**
 * Dialog izin dengan keterangan wajib. Dengan `today` diisi, ada pilihan tanggal (hari ini sampai 14 hari ke depan);
 * tanpa itu, tanggalnya tetap `initialDay` (dipakai staff yang mencatat izin untuk seseorang di tanggal terpilih).
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
  const ctl = useCheckIn(reload)
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
          {mine?.has_photo ? <PhotoThumb id={mine.id} title="Foto absenmu hari ini" subtitle={formatDayLong(today.day)} className="size-10" /> : null}
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
                <Button size="sm" disabled={ctl.busy} onClick={ctl.openHadir}>
                  <Camera /> Absen hadir
                </Button>
              ) : null}
              <Button size="sm" variant="outline" disabled={ctl.busy} onClick={ctl.openIzin}>
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
      <CheckInDialogs ctl={ctl} today={today.day} mine={mine} />
    </Card>
  )
}
