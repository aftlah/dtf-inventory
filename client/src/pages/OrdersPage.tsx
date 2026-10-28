import { useState } from 'react'
import { Check, Loader2, Wallet, X } from 'lucide-react'
import { EmptyState, ErrorState, FilterTabs, LoadingState, PageHeader, PageStack, ToneBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { formatDateTime, formatNumber, formatMoney, orderStatusLabel } from '@/lib/format'
import type { Order, OrderStatus } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'

const tone: Record<OrderStatus, 'default' | 'good' | 'bad' | 'warn'> = {
  pending: 'warn',
  approved: 'good',
  rejected: 'bad',
  cancelled: 'default',
}

const FILTERS: { value: string; label: string }[] = [
  { value: 'pending', label: 'Menunggu' },
  { value: 'approved', label: 'Disetujui' },
  { value: 'unpaid', label: 'Belum dibayar' },
  { value: 'all', label: 'Semua' },
]

function ordersUrl(filter: string) {
  if (filter === 'all') return '/orders'
  return filter === 'unpaid' ? '/orders?payment=unpaid' : `/orders?status=${filter}`
}

function OrderCard({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const { user, isStaff, isAdmin } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)

  const own = order.user_id === user?.id
  const canDecide = isStaff && order.status === 'pending' && (!own || isAdmin)
  const canCancel = order.status === 'pending' ? own || isStaff : order.status === 'approved' && isStaff

  // Status bayar hanya relevan untuk pesanan yang masih berlaku (atau yang sudah ditandai lunas).
  const showPayment = order.status === 'pending' || order.status === 'approved' || order.paid
  const canMarkPaid = isStaff && (order.paid || order.status === 'pending' || order.status === 'approved')

  async function setPaid(paid: boolean) {
    if (!paid) {
      const ok = await confirm({
        title: `Batalkan status lunas pesanan #${order.id}?`,
        description: 'Pesanan kembali ditandai belum dibayar.',
        confirmLabel: 'Ya, belum dibayar',
      })
      if (!ok) return
    }
    setBusy('paid')
    try {
      await api(`/orders/${order.id}/payment`, { method: 'POST', body: { paid } })
      toast.success(paid ? 'Ditandai sudah dibayar' : 'Ditandai belum dibayar')
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
          action === 'cancel' && order.status === 'approved'
            ? 'Stok barang dikembalikan ke lokasi asalnya.'
            : 'Stok yang dipesan dilepas kembali.',
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
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-semibold">
              Pesanan #{order.id} <ToneBadge tone={tone[order.status]}>{orderStatusLabel[order.status]}</ToneBadge>{' '}
              {showPayment ? (
                <ToneBadge tone={order.paid ? 'good' : 'bad'}>{order.paid ? 'Lunas' : 'Belum dibayar'}</ToneBadge>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {isStaff ? `${order.user_name} · ` : ''}
              {formatDateTime(order.created_at)}
            </p>
          </div>
          <p className="text-lg font-bold text-primary">{formatMoney(order.total)}</p>
        </div>

        <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
          {order.lines.map((l) => (
            <li key={l.item_id} className="flex items-center gap-3 px-3 py-2 text-sm">
              {l.image_url ? <img src={l.image_url} alt="" className="size-9 shrink-0 rounded bg-black/30 object-contain" /> : null}
              <span className="min-w-0 flex-1 truncate font-medium">{l.item_name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatNumber(l.qty)} × {formatMoney(l.unit_price)}
              </span>
            </li>
          ))}
        </ul>

        {order.note ? <p className="text-sm text-muted-foreground">Catatan: {order.note}</p> : null}

        <div className="space-y-0.5 text-xs text-muted-foreground">
          {order.decided_by_name ? (
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

        {canDecide || canCancel || canMarkPaid ? (
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
            {canDecide ? (
              <>
                <Button variant="outline" disabled={busy !== null} onClick={() => act('reject')}>
                  {busy === 'reject' ? <Loader2 className="animate-spin" /> : <X />} Tolak
                </Button>
                <Button disabled={busy !== null} onClick={() => act('approve')}>
                  {busy === 'approve' ? <Loader2 className="animate-spin" /> : <Check />} Setujui
                </Button>
              </>
            ) : null}
            {canCancel ? (
              <Button variant="destructive" disabled={busy !== null} onClick={() => act('cancel')}>
                {busy === 'cancel' ? <Loader2 className="animate-spin" /> : null} Batalkan
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function OrdersPage() {
  const { isStaff } = useAuth()
  const [filter, setFilter] = useState(isStaff ? 'pending' : 'all')
  const { data, error, loading, reload } = useAsync(
    () => api<Order[]>(ordersUrl(filter)),
    [filter],
  )

  return (
    <PageStack>
      <PageHeader
        title={isStaff ? 'Pesanan' : 'Pesanan Saya'}
        subtitle={isStaff ? 'Setujui atau tolak pesanan dari Market. Stok keluar saat disetujui.' : 'Status pesananmu di Market.'}
      />

      <FilterTabs value={filter} onChange={setFilter} tabs={FILTERS} label="Status pesanan" />

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading || !data ? (
        <LoadingState />
      ) : data.length === 0 ? (
        <EmptyState
          text={
            filter === 'pending'
              ? 'Tidak ada pesanan yang menunggu'
              : filter === 'unpaid'
                ? 'Semua pesanan sudah dibayar'
                : 'Belum ada pesanan'
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data.map((o) => (
            <OrderCard key={o.id} order={o} onChanged={reload} />
          ))}
        </div>
      )}
    </PageStack>
  )
}
