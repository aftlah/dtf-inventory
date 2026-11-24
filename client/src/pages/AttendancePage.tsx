import { useState } from 'react'
import { CalendarPlus, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, Loader2, Search, Trash2 } from 'lucide-react'
import {
  EmptyState,
  ErrorState,
  FilterTabs,
  LoadingState,
  PageHeader,
  PageStack,
  ToneBadge,
} from '@/components/common'
import { DayGrid, DayStrip, IzinDialog, statusLabel, statusTone, useCheckIn } from '@/components/attendance'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { formatClock, formatDayLong, formatDayShort, formatNumber, formatWeekday, shiftDay } from '@/lib/format'
import type { AttendanceDay, AttendanceDays, AttendancePerson, AttendanceStatus, MyAttendance } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

/* ---------- Absen saya ---------- */

function MyAttendanceView() {
  const { data, error, loading, reload } = useAsync(() => api<MyAttendance>('/attendance/me'), [])
  const { busy, hadir, izin } = useCheckIn(reload)
  const [izinOpen, setIzinOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <LoadingState />
  const { today, summary, days, upcoming } = data
  const mine = today.mine

  // Riwayat singkat: hanya hari yang punya status (hadir, izin, tidak hadir); hari kosong tidak perlu dibaris-barisi.
  const recorded = days.filter((d) => d.status !== null)
  const listed = showAll ? recorded : recorded.slice(0, 6)

  const hero = mine
    ? mine.status === 'present'
      ? { Icon: CheckCircle2, tone: 'bg-emerald-500/15 text-emerald-300', title: 'Kamu sudah masuk kota hari ini' }
      : { Icon: Clock, tone: 'bg-amber-500/15 text-amber-300', title: 'Kamu izin hari ini' }
    : { Icon: Circle, tone: 'bg-muted/60 text-muted-foreground', title: 'Kamu belum absen hari ini' }
  const detail = mine
    ? `${mine.note ? `${mine.note} · ` : ''}${mine.by_staff ? 'dicatat staff' : `dicatat ${formatClock(mine.at)} WIB`}`
    : 'Tekan tombol di samping saat kamu masuk kota.'

  return (
    <div className={cn('flex flex-col gap-4', loading && 'opacity-60')}>
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl', hero.tone)}>
              <hero.Icon className="size-7" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{formatDayLong(today.day)}</p>
              <p className="text-lg leading-tight font-semibold">{hero.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
            </div>
          </div>
          {mine?.by_staff ? (
            <p className="max-w-56 text-xs text-muted-foreground sm:text-right">Dicatat staff, jadi tidak bisa kamu ubah sendiri.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {mine?.status !== 'present' ? (
                <Button size="lg" className="h-10 px-4" disabled={busy} onClick={() => void hadir()}>
                  {busy ? <Loader2 className="animate-spin" /> : <Check />} Absen hadir
                </Button>
              ) : null}
              <Button size="lg" variant="outline" className="h-10 px-4" disabled={busy} onClick={() => setIzinOpen(true)}>
                <CalendarPlus /> {mine?.status === 'excused' ? 'Ubah izin' : 'Izin'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Izin terjadwal</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {upcoming.map((u) => (
                <li key={u.day} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium">{formatDayLong(u.day)}</span>
                    {u.note ? <span className="block truncate text-xs text-muted-foreground">{u.note}</span> : null}
                  </span>
                  <ToneBadge tone="warn">Izin</ToneBadge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Kehadiran {summary.window_days} hari terakhir</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <p className="text-xs text-muted-foreground">Tingkat kehadiran</p>
              <p className="text-2xl font-bold tabular-nums">{summary.percent === null ? '—' : `${summary.percent}%`}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <p className="text-xs text-muted-foreground">Hadir</p>
              <p className="text-2xl font-bold text-emerald-300 tabular-nums">{summary.present}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <p className="text-xs text-muted-foreground">Izin</p>
              <p className="text-2xl font-bold text-amber-300 tabular-nums">{summary.excused}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <p className="text-xs text-muted-foreground">Tidak hadir</p>
              <p className={cn('text-2xl font-bold tabular-nums', summary.absent > 0 && 'text-destructive')}>{summary.absent}</p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
            <DayGrid days={days} today={today.day} />
            <div className="min-w-0">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Catatan terbaru</p>
              {recorded.length === 0 ? (
                <p className="rounded-lg bg-muted/20 px-3 py-6 text-center text-sm text-muted-foreground">Belum ada catatan kehadiran</p>
              ) : (
                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {listed.map((d) => (
                    <li key={d.day} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block font-medium">{formatDayLong(d.day)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {d.note ? `${d.note} · ` : ''}
                          {d.status === 'present' && d.at ? `${formatClock(d.at)} WIB` : ''}
                          {d.by_staff ? ' · dicatat staff' : ''}
                        </span>
                      </span>
                      {d.status ? <ToneBadge tone={statusTone[d.status]}>{statusLabel[d.status]}</ToneBadge> : null}
                    </li>
                  ))}
                </ul>
              )}
              {recorded.length > 6 ? (
                <Button size="sm" variant="ghost" className="mt-1" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${recorded.length})`}
                </Button>
              ) : null}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Izin tidak dihitung sebagai tidak hadir. Hari yang sudah lewat tanpa absen dihitung tidak hadir, sejak absensi mulai dipakai.
          </p>
        </CardContent>
      </Card>

      <IzinDialog
        open={izinOpen}
        title="Ajukan izin"
        description="Tulis alasan kamu tidak bisa masuk kota. Keterangan wajib diisi dan bisa dilihat staff. Bisa juga untuk hari lain (sampai 14 hari ke depan)."
        today={today.day}
        initialDay={today.day}
        initialNote={mine?.status === 'excused' ? (mine.note ?? '') : ''}
        busy={busy}
        onSubmit={(day, note) => void izin(day, note).then((ok) => ok && setIzinOpen(false))}
        onClose={() => setIzinOpen(false)}
      />
    </div>
  )
}

/* ---------- Staff: siapa yang masuk kota ---------- */

function DayRosterView() {
  const toast = useToast()
  const overview = useAsync(() => api<AttendanceDays>('/attendance/days?limit=14'), [])
  const [picked, setPicked] = useState<string | null>(null)
  const day = picked ?? overview.data?.today ?? null
  const roster = useAsync(() => (day ? api<AttendanceDay>(`/attendance/day/${day}`) : Promise.resolve(null)), [day])
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [izin, setIzin] = useState<AttendancePerson | null>(null)

  const refresh = () => {
    roster.reload()
    overview.reload()
  }

  async function mark(p: AttendancePerson, body: { status: AttendanceStatus | 'none'; note?: string }) {
    setBusyId(p.user_id)
    try {
      await api(`/attendance/day/${day}/users/${p.user_id}`, { method: 'PUT', body })
      setIzin(null)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setBusyId(null)
    }
  }

  if (overview.error) return <ErrorState message={overview.error} onRetry={overview.reload} />
  if (!overview.data || !day) return <LoadingState />
  const { today, days } = overview.data
  const data = roster.data
  const q = search.trim().toLowerCase()
  const people = (data?.people ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.username.includes(q))

  return (
    <div className="flex flex-col gap-4">
      {/* Pilih tanggal */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Hari sebelumnya" onClick={() => setPicked(shiftDay(day, -1))}>
              <ChevronLeft />
            </Button>
            <Input type="date" className="w-44" value={day} max={shiftDay(today, 14)} onChange={(e) => e.target.value && setPicked(e.target.value)} aria-label="Tanggal" />
            <Button variant="outline" size="icon" aria-label="Hari berikutnya" onClick={() => setPicked(shiftDay(day, 1))} disabled={day >= shiftDay(today, 14)}>
              <ChevronRight />
            </Button>
            {day !== today ? (
              <Button variant="ghost" onClick={() => setPicked(null)}>
                Hari ini
              </Button>
            ) : null}
            <p className="ml-auto text-sm font-medium">{formatDayLong(day)}</p>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Pilih hari">
            {[...days].reverse().map((d) => (
              <button
                key={d.day}
                type="button"
                onClick={() => setPicked(d.day)}
                aria-pressed={d.day === day}
                className={cn(
                  'flex min-w-14 shrink-0 flex-col items-center rounded-lg border px-2 py-1.5 text-[11px] leading-tight transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  d.day === day ? 'border-primary/50 bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="font-medium">{formatWeekday(d.day)}</span>
                <span className="tabular-nums">{formatDayShort(d.day)}</span>
                <span className="mt-0.5 font-semibold text-emerald-300 tabular-nums">{d.present}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">Angka hijau = jumlah yang masuk kota pada hari itu.</p>
        </CardContent>
      </Card>

      {/* Ringkasan hari terpilih */}
      {data ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Masuk kota</p>
            <p className="text-2xl font-bold text-emerald-300 tabular-nums">{formatNumber(data.counts.present)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Izin</p>
            <p className="text-2xl font-bold text-amber-300 tabular-nums">{formatNumber(data.counts.excused)}</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{data.state === 'past' ? (data.tracked ? 'Tidak hadir' : 'Tanpa catatan') : 'Belum mengisi'}</p>
            <p className={cn('text-2xl font-bold tabular-nums', data.state === 'past' && data.tracked && 'text-destructive')}>{formatNumber(data.counts.none)}</p>
          </div>
        </div>
      ) : null}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input className="pl-8" placeholder="Cari nama…" aria-label="Cari nama" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {roster.error ? (
        <ErrorState message={roster.error} onRetry={roster.reload} />
      ) : !data ? (
        <LoadingState />
      ) : people.length === 0 ? (
        <EmptyState text="Tidak ada yang cocok" />
      ) : (
        <ul className={cn('divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card', roster.loading && 'opacity-60')}>
          {people.map((p) => (
            <li key={p.user_id} className="flex flex-col gap-2 px-3 py-2.5 text-sm sm:px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{p.username} · {p.role}
                  </p>
                </div>
                {p.status ? (
                  <ToneBadge tone={statusTone[p.status]}>{p.status === 'present' ? 'Masuk kota' : 'Izin'}</ToneBadge>
                ) : data.state === 'past' && data.tracked ? (
                  <ToneBadge tone="bad">Tidak hadir</ToneBadge>
                ) : data.state === 'past' ? (
                  <ToneBadge>Tanpa catatan</ToneBadge>
                ) : (
                  <ToneBadge>Belum mengisi</ToneBadge>
                )}
              </div>
              {p.status ? (
                <p className="text-xs text-muted-foreground">
                  {p.note ? `Keterangan: ${p.note} · ` : ''}
                  {p.marked_by_staff ? `Dicatat staff (${p.marked_by_name})` : 'Mengisi sendiri'}
                  {p.checked_at ? ` · ${formatClock(p.checked_at)} WIB` : ''}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {data.state !== 'future' ? (
                  <Button size="sm" variant={p.status === 'present' ? 'secondary' : 'outline'} disabled={busyId !== null} onClick={() => mark(p, { status: 'present' })}>
                    {busyId === p.user_id ? <Loader2 className="animate-spin" /> : <Check />} Hadir
                  </Button>
                ) : null}
                <Button size="sm" variant={p.status === 'excused' ? 'secondary' : 'outline'} disabled={busyId !== null} onClick={() => setIzin(p)}>
                  Izin…
                </Button>
                {p.status ? (
                  <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={busyId !== null} onClick={() => mark(p, { status: 'none' })}>
                    <Trash2 /> Hapus
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <IzinDialog
        open={izin !== null}
        title={`Izin untuk ${izin?.name ?? ''}`}
        description={`Staff mencatat izin atas nama orang ini untuk ${formatDayLong(day)}. Keterangan wajib diisi.`}
        initialDay={day}
        initialNote={izin?.status === 'excused' ? (izin.note ?? '') : ''}
        busy={busyId !== null}
        onSubmit={(_d, note) => izin && void mark(izin, { status: 'excused', note })}
        onClose={() => setIzin(null)}
      />
    </div>
  )
}

/* ---------- Tampilan fokus: akun yang hanya boleh absen (Holly, Hangaround) ---------- */

// Satu-satunya halaman mereka, jadi bukan tampilan "dashboard": satu kolom di tengah, kartu hari ini besar di atas,
// lalu ringkasan, kalender, dan catatan terbaru. Kerangka (logo + menu akun) ada di AttendanceLayout.
function FocusedAttendanceView() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useAsync(() => api<MyAttendance>('/attendance/me'), [])
  const { busy, hadir, izin } = useCheckIn(reload)
  const [izinOpen, setIzinOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return <LoadingState />
  const { today, summary, days, upcoming } = data
  const mine = today.mine
  const recorded = days.filter((d) => d.status !== null)
  const listed = showAll ? recorded : recorded.slice(0, 6)

  const theme = !mine
    ? { Icon: Circle, box: 'border-primary/40 bg-primary/10', icon: 'bg-primary/20 text-primary', title: 'Sudah masuk kota hari ini?' }
    : mine.status === 'present'
      ? { Icon: CheckCircle2, box: 'border-emerald-500/40 bg-emerald-500/10', icon: 'bg-emerald-500/20 text-emerald-300', title: 'Kamu sudah masuk kota hari ini' }
      : { Icon: Clock, box: 'border-amber-500/40 bg-amber-500/10', icon: 'bg-amber-500/20 text-amber-300', title: 'Kamu izin hari ini' }
  const detail = mine
    ? `${mine.note ? `${mine.note} · ` : ''}${mine.by_staff ? 'dicatat staff' : `dicatat ${formatClock(mine.at)} WIB`}`
    : 'Tekan Absen hadir saat kamu masuk kota, atau ajukan izin kalau tidak bisa.'

  return (
    <div className={cn('flex flex-col gap-5', loading && 'opacity-60')}>
      <section className={cn('rounded-3xl border p-6 text-center sm:p-8', theme.box)}>
        <p className="text-sm text-muted-foreground">Halo, {user?.name}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{formatDayLong(today.day)}</h1>
        <span className={cn('mx-auto mt-5 flex size-20 items-center justify-center rounded-full', theme.icon)}>
          <theme.Icon className="size-10" aria-hidden />
        </span>
        <p className="mt-4 text-xl font-semibold sm:text-2xl">{theme.title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{detail}</p>
        {mine?.by_staff ? (
          <p className="mx-auto mt-5 max-w-sm text-xs text-muted-foreground">Dicatat staff, jadi tidak bisa kamu ubah sendiri.</p>
        ) : (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {mine?.status !== 'present' ? (
              <Button size="lg" className="h-12 px-8 text-base" disabled={busy} onClick={() => void hadir()}>
                {busy ? <Loader2 className="animate-spin" /> : <Check />} Absen hadir
              </Button>
            ) : null}
            <Button size="lg" variant="outline" className="h-12 px-8 text-base" disabled={busy} onClick={() => setIzinOpen(true)}>
              <CalendarPlus /> {mine?.status === 'excused' ? 'Ubah izin' : 'Izin'}
            </Button>
          </div>
        )}
        <div className="mx-auto mt-6 max-w-md">
          <p className="mb-1.5 text-left text-xs text-muted-foreground">7 hari terakhir</p>
          <DayStrip days={days.slice(0, 7)} today={today.day} />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Tingkat kehadiran</p>
          <p className="text-2xl font-bold tabular-nums">{summary.percent === null ? '—' : `${summary.percent}%`}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Hadir</p>
          <p className="text-2xl font-bold text-emerald-300 tabular-nums">{summary.present}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Izin</p>
          <p className="text-2xl font-bold text-amber-300 tabular-nums">{summary.excused}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Tidak hadir</p>
          <p className={cn('text-2xl font-bold tabular-nums', summary.absent > 0 && 'text-destructive')}>{summary.absent}</p>
        </div>
      </div>

      {upcoming.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Izin terjadwal</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {upcoming.map((u) => (
                <li key={u.day} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium">{formatDayLong(u.day)}</span>
                    {u.note ? <span className="block truncate text-xs text-muted-foreground">{u.note}</span> : null}
                  </span>
                  <ToneBadge tone="warn">Izin</ToneBadge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Kehadiran {summary.window_days} hari terakhir</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-[minmax(0,19rem)_1fr]">
          <DayGrid days={days} today={today.day} />
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Catatan terbaru</p>
            {recorded.length === 0 ? (
              <p className="rounded-lg bg-muted/20 px-3 py-8 text-center text-sm text-muted-foreground">Belum ada catatan kehadiran</p>
            ) : (
              <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                {listed.map((d) => (
                  <li key={d.day} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium">{formatDayLong(d.day)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {d.note ? `${d.note} · ` : ''}
                        {d.status === 'present' && d.at ? `${formatClock(d.at)} WIB` : ''}
                        {d.by_staff ? ' · dicatat staff' : ''}
                      </span>
                    </span>
                    {d.status ? <ToneBadge tone={statusTone[d.status]}>{statusLabel[d.status]}</ToneBadge> : null}
                  </li>
                ))}
              </ul>
            )}
            {recorded.length > 6 ? (
              <Button size="sm" variant="ghost" className="mt-1" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${recorded.length})`}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <p className="px-1 text-center text-[11px] text-muted-foreground">
        Izin tidak dihitung sebagai tidak hadir. Hari yang sudah lewat tanpa absen dihitung tidak hadir, sejak absensi mulai dipakai.
      </p>

      <IzinDialog
        open={izinOpen}
        title="Ajukan izin"
        description="Tulis alasan kamu tidak bisa masuk kota. Keterangan wajib diisi dan bisa dilihat staff. Bisa juga untuk hari lain (sampai 14 hari ke depan)."
        today={today.day}
        initialDay={today.day}
        initialNote={mine?.status === 'excused' ? (mine.note ?? '') : ''}
        busy={busy}
        onSubmit={(day, note) => void izin(day, note).then((ok) => ok && setIzinOpen(false))}
        onClose={() => setIzinOpen(false)}
      />
    </div>
  )
}

/* ---------- Halaman ---------- */

export function AttendancePage() {
  const { isStaff, isAttendanceOnly } = useAuth()
  const [tab, setTab] = useState<'me' | 'staff'>('me')

  // Holly/Hangaround: halaman ini satu-satunya, jadi tampilannya dibuat fokus (bukan dashboard).
  if (isAttendanceOnly) return <FocusedAttendanceView />

  return (
    <PageStack>
      <PageHeader
        title="Absensi"
        subtitle={
          tab === 'staff'
            ? 'Lihat siapa saja yang masuk kota di hari tertentu, dan koreksi bila perlu.'
            : 'Absen setiap hari saat kamu masuk kota, atau ajukan izin dengan keterangan.'
        }
      />
      {isStaff ? (
        <FilterTabs
          value={tab}
          onChange={(v) => setTab(v as 'me' | 'staff')}
          label="Tampilan absensi"
          tabs={[
            { value: 'me', label: 'Absen saya' },
            { value: 'staff', label: 'Siapa masuk kota' },
          ]}
        />
      ) : null}
      {tab === 'staff' && isStaff ? <DayRosterView /> : <MyAttendanceView />}
    </PageStack>
  )
}
