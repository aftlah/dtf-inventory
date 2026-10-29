import { useEffect, useState } from 'react'
import { Check, CheckCircle2, ChevronDown, Circle, ListChecks, Loader2, Search, Wallet, X } from 'lucide-react'
import { EmptyState, ErrorState, FilterTabs, LoadingState, PageHeader, PageStack, ToneBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { formatDateTime, formatNumber, formatMoney, orderStatusLabel } from '@/lib/format'
import type { Order, OrderStatus } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

const tone: Record<OrderStatus, 'default' | 'good' | 'bad' | 'warn'> = {
  pending: 'warn',
  approved: 'good',
  rejected: 'bad',
  cancelled: 'default',
}

// Alur pesanan: pesanan Market langsung aktif tanpa persetujuan → Belum dibayar → Perlu diserahkan (lunas, barang
// belum semua diserahkan petugas brangkas) → Selesai (lunas dan semua barang diserahkan).
// Dibatalkan = dibatalkan pembeli/staff atau ditolak. "Menunggu" hanya muncul bila masih ada pesanan lama yang
// berstatus menunggu persetujuan.
const PENDING_TAB = { value: 'pending', label: 'Menunggu' }
const FILTERS: { value: string; label: string }[] = [
  { value: 'unpaid', label: 'Belum dibayar' },
  { value: 'handover', label: 'Perlu diserahkan' },
  { value: 'done', label: 'Selesai' },
  { value: 'cancelled', label: 'Dibatalkan' },
  { value: 'all', label: 'Semua' },
]

const FILTER_QUERY: Record<string, string> = {
  all: '',
  pending: 'status=pending',
  unpaid: 'status=approved&payment=unpaid',
  handover: 'delivery=pending',
  done: 'delivery=done',
  cancelled: 'status=cancelled,rejected',
}

function ordersUrl(filter: string) {
  const qs = FILTER_QUERY[filter] ?? ''
  return qs ? `/orders?${qs}` : '/orders'
}

const THUMBS = 3

function OrderCard({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const { user, isStaff, isAdmin } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const own = order.user_id === user?.id
  const canDecide = isStaff && order.status === 'pending' && (!own || isAdmin)

  // Status bayar hanya relevan untuk pesanan yang masih berlaku (atau yang sudah ditandai lunas).
  const showPayment = order.status === 'pending' || order.status === 'approved' || order.paid
  const canMarkPaid = isStaff && (order.paid || order.status === 'pending' || order.status === 'approved')

  // Penyerahan barang: dicentang petugas brangkas per barang, hanya setelah pesanan disetujui dan dibayar.
  const handedCount = order.lines.filter((l) => l.handed_at).length
  const allHanded = order.lines.length > 0 && handedCount === order.lines.length
  const showHandover = order.status === 'approved'
  const canHandover = isStaff && order.status === 'approved' && order.paid
  const done = order.status === 'approved' && order.paid && allHanded // lunas dan semua barang diserahkan
  // Staff bisa membatalkan pesanan aktif; pembeli hanya selama belum dibayar. Sebagian barang sudah diserahkan = tidak bisa.
  const canCancel =
    order.status === 'pending'
      ? own || isStaff
      : order.status === 'approved' && handedCount === 0 && (isStaff || (own && !order.paid))

  const totalQty = order.lines.reduce((sum, l) => sum + l.qty, 0)
  const shown = order.lines.slice(0, 2).map((l) => `${l.item_name} ×${formatNumber(l.qty)}`)
  const rest = order.lines.length - shown.length
  const summary = shown.join(', ') + (rest > 0 ? ` +${rest} lainnya` : '')

  async function setHanded(itemIds: number[], handed: boolean) {
    setBusy('handover')
    try {
      await api(`/orders/${order.id}/handover`, { method: 'POST', body: { item_ids: itemIds, handed } })
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan penyerahan')
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  async function setPaid(paid: boolean) {
    if (!paid) {
      const ok = await confirm({
        title: `Batalkan status lunas pesanan #${order.id}?`,
        description: 'Pesanan kembali ditandai belum dibayar. Pemasukan terkait di Buku Kas ikut dihapus.',
        confirmLabel: 'Ya, belum dibayar',
      })
      if (!ok) return
    }
    setBusy('paid')
    try {
      await api(`/orders/${order.id}/payment`, { method: 'POST', body: { paid } })
      toast.success(paid ? 'Ditandai sudah dibayar · tercatat di Buku Kas' : 'Ditandai belum dibayar')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memperbarui pembayaran')
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  async function act(action: 'approve' | 'reject' | 'cancel') {
    if (action !== 'approve') {
      const ok = await confirm({
        title: action === 'reject' ? `Tolak pesanan #${order.id}?` : `Batalkan pesanan #${order.id}?`,
        description:
          (action === 'cancel' && order.status === 'approved'
            ? 'Stok barang dikembalikan ke lokasi asalnya.'
            : 'Stok yang dipesan dilepas kembali.') +
          (order.paid ? ' Pesanan ini sudah dibayar: catat pengembalian dana di Buku Kas bila perlu.' : ''),
        confirmLabel: action === 'reject' ? 'Tolak' : 'Batalkan',
      })
      if (!ok) return
    }
    setBusy(action)
    try {
      await api(`/orders/${order.id}/${action}`, { method: 'POST' })
      toast.success({ approve: 'Pesanan disetujui', reject: 'Pesanan ditolak', cancel: 'Pesanan dibatalkan' }[action])
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memproses pesanan')
      onChanged()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Tutup' : 'Buka'} detail pesanan #${order.id}`}
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 basis-72 items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="flex shrink-0 -space-x-3" aria-hidden>
            {order.lines.slice(0, THUMBS).map((l) => (
              <span key={l.item_id} className="flex size-10 items-center justify-center overflow-hidden rounded-lg border border-border bg-card ring-2 ring-card">
                {l.image_url ? <img src={l.image_url} alt="" className="size-full bg-black/30 object-contain p-0.5" /> : null}
              </span>
            ))}
            {order.lines.length > THUMBS ? (
              <span className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted text-xs font-semibold text-muted-foreground ring-2 ring-card">
                +{order.lines.length - THUMBS}
              </span>
            ) : null}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5 font-semibold">
              #{order.id}
              {order.status !== 'approved' || done ? (
                <ToneBadge tone={tone[order.status]}>{done ? 'Selesai' : orderStatusLabel[order.status]}</ToneBadge>
              ) : null}
              {showPayment && !done ? (
                <ToneBadge tone={order.paid ? 'good' : 'bad'}>{order.paid ? 'Lunas' : 'Belum dibayar'}</ToneBadge>
              ) : null}
              {showHandover && order.paid && !allHanded ? (
                <ToneBadge tone="warn">
                  Diserahkan {handedCount}/{order.lines.length}
                </ToneBadge>
              ) : null}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {isStaff ? `${order.user_name} · ` : ''}
              {formatDateTime(order.created_at)}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{summary}</span>
          </span>

          <span className="shrink-0 text-right">
            <span className="block text-base font-bold text-primary">{formatMoney(order.total)}</span>
            <span className="block text-xs text-muted-foreground">{formatNumber(totalQty)} barang</span>
          </span>
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
        </button>

        {canDecide ? (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => act('reject')}>
              {busy === 'reject' ? <Loader2 className="animate-spin" /> : <X />} Tolak
            </Button>
            <Button size="sm" disabled={busy !== null} onClick={() => act('approve')}>
              {busy === 'approve' ? <Loader2 className="animate-spin" /> : <Check />} Setujui
            </Button>
          </div>
        ) : canHandover && !allHanded ? (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <ListChecks /> Cek barang
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="flex flex-col gap-3 border-t border-border/60 p-3">
          {showHandover && isStaff ? (
            order.paid ? (
              !allHanded ? (
                <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-foreground">
                  Centang barang yang <span className="font-semibold">sudah diserahkan</span> ke pembeli. Barang yang belum
                  dicentang berarti belum diberikan.
                </p>
              ) : null
            ) : (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                Pesanan harus <span className="font-semibold">sudah dibayar</span> dulu sebelum barang diserahkan. Klik
                "Tandai sudah dibayar" di bawah.
              </p>
            )
          ) : null}

          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {order.lines.map((l) => {
              const handed = !!l.handed_at
              return (
                <li key={l.item_id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                  {showHandover ? (
                    isStaff ? (
                      <Checkbox
                        checked={handed}
                        onCheckedChange={(v) => void setHanded([l.item_id], v === true)}
                        aria-label={`${l.item_name} sudah diserahkan`}
                        disabled={!canHandover || busy !== null}
                        className="size-5 rounded-md border-2 border-primary/70"
                      />
                    ) : handed ? (
                      <CheckCircle2 className="size-5 shrink-0 text-emerald-400" aria-label="Sudah diterima" />
                    ) : (
                      <Circle className="size-5 shrink-0 text-muted-foreground/50" aria-label="Belum diterima" />
                    )
                  ) : null}
                  {l.image_url ? <img src={l.image_url} alt="" className="size-8 shrink-0 rounded bg-black/30 object-contain" /> : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.item_name}</span>
                    {showHandover ? (
                      <span className={cn('block truncate text-xs', handed ? 'text-emerald-300' : 'text-muted-foreground')}>
                        {handed
                          ? `Diserahkan${isStaff && l.handed_by_name ? ` oleh ${l.handed_by_name}` : ''}${l.handed_at ? ` · ${formatDateTime(l.handed_at)}` : ''}`
                          : 'Belum diserahkan'}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatNumber(l.qty)} × {formatMoney(l.unit_price)}
                  </span>
                  <span className="w-24 shrink-0 text-right font-medium tabular-nums">{formatMoney(l.qty * l.unit_price)}</span>
                </li>
              )
            })}
          </ul>

          {canHandover && !allHanded ? (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  void setHanded(
                    order.lines.filter((l) => !l.handed_at).map((l) => l.item_id),
                    true,
                  )
                }
              >
                {busy === 'handover' ? <Loader2 className="animate-spin" /> : <ListChecks />} Tandai semua sudah diserahkan
              </Button>
            </div>
          ) : null}

          {order.note ? <p className="text-sm text-muted-foreground">Catatan: {order.note}</p> : null}

          <div className="space-y-0.5 text-xs text-muted-foreground">
            {order.decided_by_name && order.decided_by_name !== 'Otomatis' ? (
              <p>
                {order.status === 'rejected' ? 'Ditolak' : 'Disetujui'} oleh {order.decided_by_name}
                {order.decided_at ? ` · ${formatDateTime(order.decided_at)}` : ''}
              </p>
            ) : null}
            {order.paid && order.paid_by_name ? (
              <p>
                Dibayar · dicatat oleh {order.paid_by_name}
                {order.paid_at ? ` · ${formatDateTime(order.paid_at)}` : ''}
              </p>
            ) : null}
            {order.cancelled_by_name ? (
              <p>
                Dibatalkan oleh {order.cancelled_by_name}
                {order.cancelled_at ? ` · ${formatDateTime(order.cancelled_at)}` : ''}
              </p>
            ) : null}
            {isStaff && order.allocations.length ? (
              <p>
                Diambil dari:{' '}
                {order.allocations.map((a) => `${a.location_name} (${formatNumber(a.qty)})`).join(', ')}
              </p>
            ) : null}
          </div>

          {canMarkPaid || canCancel ? (
            <div className="flex flex-wrap justify-end gap-2">
              {canMarkPaid ? (
                <Button
                  variant={order.paid ? 'outline' : 'secondary'}
                  disabled={busy !== null}
                  onClick={() => setPaid(!order.paid)}
                >
                  {busy === 'paid' ? <Loader2 className="animate-spin" /> : <Wallet />}{' '}
                  {order.paid ? 'Tandai belum dibayar' : 'Tandai sudah dibayar'}
                </Button>
              ) : null}
              {canCancel ? (
                <Button variant="destructive" disabled={busy !== null} onClick={() => act('cancel')}>
                  {busy === 'cancel' ? <Loader2 className="animate-spin" /> : null} Batalkan
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

const PAGE_SIZE = 30

const EMPTY_TEXT: Record<string, string> = {
  pending: 'Tidak ada pesanan yang menunggu',
  unpaid: 'Semua pesanan sudah dibayar',
  handover: 'Tidak ada barang yang perlu diserahkan',
  done: 'Belum ada pesanan yang selesai',
  cancelled: 'Tidak ada pesanan yang dibatalkan',
}

export function OrdersPage() {
  const { isStaff } = useAuth()
  const [filter, setFilter] = useState(isStaff ? 'unpaid' : 'all')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('') // search yang sudah di-debounce
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  // Ketik dulu, baru cari setelah berhenti sebentar.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])
  // Ganti pencarian/filter = kembali ke halaman pertama.
  useEffect(() => setLimit(PAGE_SIZE), [filter, q, from, to])

  const { data, error, loading, reload } = useAsync(() => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    params.set('limit', String(limit))
    const base = ordersUrl(filter)
    return api<Order[]>(`${base}${base.includes('?') ? '&' : '?'}${params}`)
  }, [filter, q, from, to, limit])

  // Pesanan lama yang masih menunggu persetujuan (sebelum pesanan otomatis aktif): tab "Menunggu" hanya muncul bila ada.
  // Angka penanda di tab (butuh tindakan): diperbarui tiap 30 detik dan setiap kali ada perubahan.
  const counts = useAsync(() => api<{ pending: number; unpaid: number; handover: number }>('/orders/counts'), [])
  useEffect(() => {
    const t = setInterval(() => counts.reload(), 30000)
    return () => clearInterval(t)
  }, [counts.reload])
  const hasLegacy = (counts.data?.pending ?? 0) > 0
  useEffect(() => {
    if (filter === 'pending' && counts.data && counts.data.pending === 0) setFilter('unpaid')
  }, [filter, counts.data])
  const tabs = (hasLegacy ? [PENDING_TAB, ...FILTERS] : FILTERS).map((t) => ({
    ...t,
    count: t.value === 'pending' ? counts.data?.pending : t.value === 'unpaid' ? counts.data?.unpaid : t.value === 'handover' ? counts.data?.handover : undefined,
  }))
  const refresh = () => {
    reload()
    counts.reload()
  }

  const filtered = q !== '' || from !== '' || to !== ''
  const hasMore = !!data && data.length >= limit && limit < 200

  return (
    <PageStack>
      <PageHeader
        title={isStaff ? 'Pesanan' : 'Pesanan Saya'}
        subtitle={
          isStaff
            ? 'Pesanan masuk langsung aktif. Tandai lunas setelah dibayar, lalu centang barang yang sudah diserahkan ke pembeli.'
            : 'Status pesananmu di Market.'
        }
      />

      <FilterTabs value={filter} onChange={setFilter} tabs={tabs} label="Status pesanan" />

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-48 flex-1 basis-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="pl-8"
            placeholder={isStaff ? 'Cari nomor, pembeli, atau barang…' : 'Cari nomor atau barang…'}
            aria-label="Cari pesanan"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Dari
          <Input type="date" className="w-40" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Sampai
          <Input type="date" className="w-40" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        {filtered ? (
          <Button
            variant="ghost"
            onClick={() => {
              setSearch('')
              setQ('')
              setFrom('')
              setTo('')
            }}
          >
            <X /> Reset
          </Button>
        ) : null}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : !data ? (
        <LoadingState />
      ) : data.length === 0 ? (
        <EmptyState text={filtered ? 'Tidak ada pesanan yang cocok' : (EMPTY_TEXT[filter] ?? 'Belum ada pesanan')} />
      ) : (
        <>
          <div className={cn('flex flex-col gap-2', loading && 'opacity-60')}>
            {data.map((o) => (
              <OrderCard key={o.id} order={o} onChanged={refresh} />
            ))}
          </div>
          {hasMore ? (
            <Button variant="outline" className="self-center" disabled={loading} onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, 200))}>
              {loading ? <Loader2 className="animate-spin" /> : null} Muat lebih banyak
            </Button>
          ) : null}
        </>
      )}
    </PageStack>
  )
}
