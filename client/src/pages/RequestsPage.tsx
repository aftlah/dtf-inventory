import { useMemo, useState, type FormEvent } from 'react'
import { Check, ExternalLink, Loader2, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import {
  EmptyState,
  ErrorState,
  Field,
  FilterTabs,
  LoadingState,
  OptionSelect,
  PageHeader,
  PageStack,
  ToneBadge,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { useAuth } from '@/contexts/AuthContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { formatDateTime, formatMoney, formatNumber, requestKindLabel, requestStatusLabel } from '@/lib/format'
import type { RequestKind, RequestOptions, RequestRow, RequestStatus } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'

const tone: Record<RequestStatus, 'default' | 'good' | 'bad' | 'warn'> = {
  pending: 'warn',
  approved: 'default',
  reported: 'warn',
  completed: 'good',
  rejected: 'bad',
  cancelled: 'default',
}

const COPY: Record<RequestKind, { subtitle: string; newLabel: string; reportHint: string }> = {
  sale: {
    subtitle: 'Ajukan barang untuk dijual. Setelah disetujui, laporkan uang hasilnya beserta link bukti.',
    newLabel: 'Ajukan penjualan',
    reportHint: 'Masukkan jumlah uang hasil penjualan dan link bukti (mis. screenshot di Imgur).',
  },
  process: {
    subtitle: 'Ajukan bahan untuk diproses. Setelah disetujui, laporkan item hasilnya beserta link bukti.',
    newLabel: 'Ajukan pemrosesan',
    reportHint: 'Isi item hasil pemrosesan dan link bukti. Hasil masuk ke stok setelah dikonfirmasi staff.',
  },
}

type Line = { item_id: string; qty: string }
const emptyLine: Line = { item_id: '', qty: '1' }

type PickOption = { value: string; label: string; image: string | null }

function LineEditor({
  lines,
  onChange,
  options,
  hint,
}: {
  lines: Line[]
  onChange: (lines: Line[]) => void
  options: PickOption[]
  hint?: (itemId: number) => string | null
}) {
  const update = (i: number, patch: Partial<Line>) =>
    onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  return (
    <div className="flex flex-col gap-2">
      {lines.map((l, i) => {
        const h = hint && l.item_id ? hint(Number(l.item_id)) : null
        return (
          <div key={i} className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <OptionSelect
                searchable
                value={l.item_id}
                onChange={(v) => update(i, { item_id: v })}
                options={options}
                placeholder="Pilih barang…"
              />
              {h ? <p className="text-xs text-muted-foreground">{h}</p> : null}
            </div>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              className="w-24"
              value={l.qty}
              onChange={(e) => update(i, { qty: e.target.value })}
              aria-label="Jumlah"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={lines.length === 1}
              aria-label="Hapus baris"
              onClick={() => onChange(lines.filter((_, idx) => idx !== i))}
            >
              <Trash2 />
            </Button>
          </div>
        )
      })}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...lines, { ...emptyLine }])}>
        <Plus /> Tambah barang
      </Button>
    </div>
  )
}

const toLines = (lines: Line[]) =>
  lines
    .map((l) => ({ item_id: Number(l.item_id), qty: Math.floor(Number(l.qty)) }))
    .filter((l) => l.item_id && l.qty > 0)

type Dialogs =
  | { type: 'new' }
  | { type: 'report'; request: RequestRow }
  | { type: 'reason'; request: RequestRow; action: 'reject' | 'reopen' }
  | null

function RequestCard({
  request,
  onReport,
  onReason,
  onChanged,
}: {
  request: RequestRow
  onReport: () => void
  onReason: (action: 'reject' | 'reopen') => void
  onChanged: () => void
}) {
  const { user, isStaff, isAdmin } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)

  const own = request.user_id === user?.id
  const canProcess = isStaff && (!own || isAdmin)
  const inputs = request.items.filter((i) => i.role === 'input')
  const results = request.items.filter((i) => i.role === 'result')

  async function act(action: 'approve' | 'confirm' | 'cancel') {
    if (action === 'cancel') {
      const ok = await confirm({
        title: `Batalkan pengajuan #${request.id}?`,
        description: 'Stok yang dipesan dilepas kembali.',
        confirmLabel: 'Batalkan',
      })
      if (!ok) return
    }
    setBusy(action)
    try {
      await api(`/requests/${request.id}/${action}`, { method: 'POST', body: {} })
      toast.success({ approve: 'Pengajuan disetujui', confirm: 'Laporan dikonfirmasi', cancel: 'Pengajuan dibatalkan' }[action])
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memproses pengajuan')
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  const showActions =
    (request.status === 'pending' && (own || isStaff)) ||
    (request.status === 'approved' && own) ||
    (request.status === 'reported' && canProcess)

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">
              {requestKindLabel[request.kind]} #{request.id}{' '}
              <ToneBadge tone={tone[request.status]}>{requestStatusLabel[request.status]}</ToneBadge>
            </p>
            <p className="text-xs text-muted-foreground">
              {isStaff ? `${request.user_name} · ` : ''}
              {formatDateTime(request.created_at)}
            </p>
          </div>
          {request.result_money !== null ? (
            <p className="text-lg font-bold text-primary">{formatMoney(request.result_money)}</p>
          ) : null}
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">{request.kind === 'sale' ? 'Barang dijual' : 'Bahan'}</p>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {inputs.map((l) => (
              <li key={`i${l.item_id}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                {l.image_url ? <img src={l.image_url} alt="" className="size-9 shrink-0 rounded bg-black/30 object-contain" /> : null}
                <span className="min-w-0 flex-1 truncate font-medium">{l.item_name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">×{formatNumber(l.qty)}</span>
              </li>
            ))}
          </ul>
        </div>

        {results.length ? (
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Hasil pemrosesan</p>
            <ul className="divide-y divide-border/60 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
              {results.map((l) => (
                <li key={`r${l.item_id}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                  {l.image_url ? <img src={l.image_url} alt="" className="size-9 shrink-0 rounded bg-black/30 object-contain" /> : null}
                  <span className="min-w-0 flex-1 truncate font-medium">{l.item_name}</span>
                  <span className="shrink-0 tabular-nums">×{formatNumber(l.qty)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-0.5 text-xs text-muted-foreground">
          {request.proof_url ? (
            <p>
              <a
                href={request.proof_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Lihat bukti <ExternalLink className="size-3" aria-hidden />
              </a>
            </p>
          ) : null}
          {request.review_note ? <p>Catatan staff: {request.review_note}</p> : null}
          {request.reviewed_by_name ? (
            <p>
              {request.status === 'rejected' ? 'Ditolak' : 'Disetujui'} oleh {request.reviewed_by_name}
              {request.reviewed_at ? ` · ${formatDateTime(request.reviewed_at)}` : ''}
            </p>
          ) : null}
          {request.confirmed_by_name ? (
            <p>
              Dikonfirmasi oleh {request.confirmed_by_name}
              {request.completed_at ? ` · ${formatDateTime(request.completed_at)}` : ''}
            </p>
          ) : null}
        </div>

        {showActions ? (
          <div className="flex flex-wrap justify-end gap-2">
            {request.status === 'pending' ? (
              <>
                {canProcess ? (
                  <>
                    <Button variant="outline" disabled={busy !== null} onClick={() => onReason('reject')}>
                      <X /> Tolak
                    </Button>
                    <Button disabled={busy !== null} onClick={() => act('approve')}>
                      {busy === 'approve' ? <Loader2 className="animate-spin" /> : <Check />} Setujui
                    </Button>
                  </>
                ) : null}
                <Button variant="destructive" disabled={busy !== null} onClick={() => act('cancel')}>
                  Batalkan
                </Button>
              </>
            ) : null}
            {request.status === 'approved' && own ? (
              <Button onClick={onReport}>Laporkan hasil</Button>
            ) : null}
            {request.status === 'reported' && canProcess ? (
              <>
                <Button variant="outline" disabled={busy !== null} onClick={() => onReason('reopen')}>
                  <RotateCcw /> Minta lapor ulang
                </Button>
                <Button disabled={busy !== null} onClick={() => act('confirm')}>
                  {busy === 'confirm' ? <Loader2 className="animate-spin" /> : <Check />} Konfirmasi
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function RequestsPage({ kind }: { kind: RequestKind }) {
  const { isStaff } = useAuth()
  const toast = useToast()
  const copy = COPY[kind]

  const tabs = isStaff
    ? [
        { value: 'open', label: 'Perlu diproses' },
        { value: 'approved', label: 'Menunggu laporan' },
        { value: 'completed', label: 'Selesai' },
        { value: 'all', label: 'Semua' },
      ]
    : [
        { value: 'all', label: 'Semua' },
        { value: 'approved', label: 'Perlu dilaporkan' },
        { value: 'open', label: 'Menunggu staff' },
        { value: 'completed', label: 'Selesai' },
      ]
  const [filter, setFilter] = useState(tabs[0].value)

  const list = useAsync(
    () => api<RequestRow[]>(`/requests?kind=${kind}${filter === 'all' ? '' : `&status=${filter}`}`),
    [kind, filter],
  )
  const options = useAsync(() => api<RequestOptions>(`/requests/options?kind=${kind}`), [kind])

  const [dialog, setDialog] = useState<Dialogs>(null)
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }])
  const [money, setMoney] = useState('')
  const [proof, setProof] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const itemById = useMemo(() => new Map((options.data?.items ?? []).map((i) => [i.id, i])), [options.data])
  const pickOptions = useMemo<PickOption[]>(
    () => (options.data?.items ?? []).map((i) => ({ value: String(i.id), label: i.name, image: i.image_url })),
    [options.data],
  )
  const resultOptions = useMemo<PickOption[]>(
    () => (options.data?.resultItems ?? []).map((i) => ({ value: String(i.id), label: i.name, image: i.image_url })),
    [options.data],
  )

  function open(next: Dialogs) {
    setLines([{ ...emptyLine }])
    setMoney('')
    setProof('')
    setReason('')
    setDialog(next)
  }

  async function submit(path: string, body: unknown, successText: string) {
    setBusy(true)
    try {
      await api(path, { method: 'POST', body })
      toast.success(successText)
      setDialog(null)
      list.reload()
      options.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setBusy(false)
    }
  }

  function onNew(e: FormEvent) {
    e.preventDefault()
    const picked = toLines(lines)
    if (!picked.length) return toast.error('Pilih minimal satu barang')
    void submit('/requests', { kind, lines: picked }, 'Pengajuan dikirim, menunggu persetujuan staff')
  }

  function onReport(e: FormEvent) {
    e.preventDefault()
    if (dialog?.type !== 'report') return
    const id = dialog.request.id
    if (kind === 'sale') {
      void submit(`/requests/${id}/report`, { money: Math.floor(Number(money)), proof }, 'Laporan dikirim, menunggu konfirmasi staff')
    } else {
      const results = toLines(lines)
      if (!results.length) return toast.error('Isi item hasil pemrosesan')
      void submit(`/requests/${id}/report`, { proof, results }, 'Laporan dikirim, menunggu konfirmasi staff')
    }
  }

  function onReason(e: FormEvent) {
    e.preventDefault()
    if (dialog?.type !== 'reason') return
    const { request, action } = dialog
    void submit(
      `/requests/${request.id}/${action}`,
      { note: reason },
      action === 'reject' ? 'Pengajuan ditolak' : 'Laporan dikembalikan ke member',
    )
  }

  const hint = (id: number) => {
    const i = itemById.get(id)
    if (!i) return null
    return `Tersedia ${formatNumber(i.available)} ${i.unit}${kind === 'sale' && i.min_qty > 1 ? ` · minimal ${formatNumber(i.min_qty)}` : ''}`
  }

  return (
    <PageStack>
      <PageHeader title={requestKindLabel[kind]} subtitle={copy.subtitle}>
        <Button onClick={() => open({ type: 'new' })}>
          <Plus /> {copy.newLabel}
        </Button>
      </PageHeader>

      <FilterTabs value={filter} onChange={setFilter} tabs={tabs} label="Status pengajuan" />

      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.loading || !list.data ? (
        <LoadingState />
      ) : list.data.length === 0 ? (
        <EmptyState text={filter === 'open' && isStaff ? 'Tidak ada pengajuan yang perlu diproses' : 'Belum ada pengajuan'} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.data.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              onChanged={() => {
                list.reload()
                options.reload()
              }}
              onReport={() => open({ type: 'report', request: r })}
              onReason={(action) => open({ type: 'reason', request: r, action })}
            />
          ))}
        </div>
      )}

      {/* Buat pengajuan */}
      <Dialog open={dialog?.type === 'new'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{copy.newLabel}</DialogTitle>
            <DialogDescription>
              {kind === 'sale'
                ? 'Pilih barang dan jumlah yang mau dijual. Stok langsung dipesankan untukmu.'
                : 'Pilih bahan dan jumlah yang mau diproses. Stok langsung dipesankan untukmu.'}
            </DialogDescription>
          </DialogHeader>
          {options.loading && !options.data ? (
            <LoadingState />
          ) : pickOptions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada barang yang bisa diajukan untuk {requestKindLabel[kind]}. Admin perlu mengaktifkannya di Katalog Barang.
            </p>
          ) : (
            <form id="request-form" onSubmit={onNew} className="flex flex-col gap-4">
              <LineEditor lines={lines} onChange={setLines} options={pickOptions} hint={hint} />
            </form>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Batal
            </Button>
            <Button type="submit" form="request-form" disabled={busy || pickOptions.length === 0}>
              {busy ? <Loader2 className="animate-spin" /> : null} {busy ? 'Mengirim…' : 'Kirim pengajuan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Laporkan hasil */}
      <Dialog open={dialog?.type === 'report'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Laporkan hasil {dialog?.type === 'report' ? `#${dialog.request.id}` : ''}
            </DialogTitle>
            <DialogDescription>{copy.reportHint}</DialogDescription>
          </DialogHeader>
          <form id="report-form" onSubmit={onReport} className="flex flex-col gap-4">
            {kind === 'sale' ? (
              <Field label="Uang hasil penjualan ($)">
                <Input type="number" inputMode="numeric" min={1} step={1} value={money} onChange={(e) => setMoney(e.target.value)} required />
              </Field>
            ) : (
              <Field label="Item hasil pemrosesan">
                <LineEditor lines={lines} onChange={setLines} options={resultOptions} />
              </Field>
            )}
            <Field label="Link bukti" hint="Harus berupa URL http(s), mis. https://imgur.com/…">
              <Input type="url" value={proof} onChange={(e) => setProof(e.target.value)} placeholder="https://" required />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Batal
            </Button>
            <Button type="submit" form="report-form" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} {busy ? 'Mengirim…' : 'Kirim laporan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alasan: tolak / minta lapor ulang */}
      <Dialog open={dialog?.type === 'reason'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.type === 'reason' && dialog.action === 'reject' ? 'Tolak pengajuan' : 'Minta lapor ulang'}
            </DialogTitle>
            <DialogDescription>
              {dialog?.type === 'reason' && dialog.action === 'reject'
                ? 'Stok yang dipesan dilepas kembali. Alasan akan terlihat oleh member.'
                : 'Laporan dikembalikan ke member untuk diisi ulang. Alasan akan terlihat oleh member.'}
            </DialogDescription>
          </DialogHeader>
          <form id="reason-form" onSubmit={onReason}>
            <Field label="Alasan (opsional)">
              <Textarea maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Batal
            </Button>
            <Button type="submit" form="reason-form" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Kirim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageStack>
  )
}
