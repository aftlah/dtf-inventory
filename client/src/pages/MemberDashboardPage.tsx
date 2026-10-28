import { useMemo } from 'react'
import {
  ClipboardCheck,
  FlaskConical,
  HandCoins,
  PackageOpen,
  Receipt,
  ShoppingBag,
  Store,
  Trophy,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  EmptyState,
  ErrorState,
  Kpi,
  LoadingState,
  PageHeader,
  PageStack,
  ToneBadge,
} from '@/components/common'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import { formatDateTime, formatMoney, formatNumber, orderStatusLabel, requestKindLabel, requestStatusLabel } from '@/lib/format'
import type { LeaderRow, MemberDashboard, OrderStatus, RequestStatus } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

const SHORTCUTS: { to: string; label: string; hint: string; icon: LucideIcon }[] = [
  { to: '/market', label: 'Market', hint: 'Beli barang', icon: Store },
  { to: '/sales/new', label: 'Ajukan Penjualan', hint: 'Jual dari stok', icon: PackageOpen },
  { to: '/buyback/new', label: 'Jual Barang', hint: 'Jual ke toko', icon: HandCoins },
  { to: '/process/new', label: 'Ajukan Pemrosesan', hint: 'Olah bahan', icon: FlaskConical },
]

const orderTone: Record<OrderStatus, 'default' | 'good' | 'bad' | 'warn'> = {
  pending: 'warn',
  approved: 'good',
  rejected: 'bad',
  cancelled: 'default',
}
const requestTone: Record<RequestStatus, 'default' | 'good' | 'bad' | 'warn'> = {
  pending: 'warn',
  approved: 'default',
  reported: 'warn',
  completed: 'good',
  rejected: 'bad',
  cancelled: 'default',
}
const kindPath = { sale: '/sales', process: '/process', buyback: '/buyback' } as const

const dayMonth = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(iso))

function Leaderboard({ title, rows, meId }: { title: string; rows: LeaderRow[]; meId: number | undefined }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4 text-primary" aria-hidden /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data minggu ini</p>
        ) : (
          <ol className="space-y-1.5">
            {rows.map((r, i) => (
              <li
                key={r.user_id}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm',
                  r.user_id === meId ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-muted/30',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    i === 0 ? 'bg-amber-400/20 text-amber-300' : 'bg-secondary text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {r.name}
                  {r.user_id === meId ? <span className="ml-1.5 text-xs font-normal text-primary">(kamu)</span> : null}
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block font-semibold">{formatMoney(r.amount)}</span>
                  <span className="block text-[11px] text-muted-foreground">{formatNumber(r.count)}×</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

export function MemberDashboardPage() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useAsync(() => api<MemberDashboard>('/me/dashboard'), [])

  // Pesanan dan pengajuan digabung jadi satu daftar aktivitas, terbaru di atas.
  const activity = useMemo(() => {
    if (!data) return []
    return [
      ...data.recent_orders.map((o) => ({
        key: `o${o.id}`,
        at: o.created_at,
        to: '/orders',
        title: `Pesanan #${o.id}`,
        badge: <ToneBadge tone={orderTone[o.status]}>{orderStatusLabel[o.status]}</ToneBadge>,
        extra: o.status === 'pending' || o.status === 'approved' ? (o.paid ? 'Lunas' : 'Belum dibayar') : null,
        amount: o.total,
      })),
      ...data.recent_requests.map((r) => ({
        key: `r${r.id}`,
        at: r.created_at,
        to: kindPath[r.kind],
        title: `${requestKindLabel[r.kind]} #${r.id}`,
        badge: <ToneBadge tone={requestTone[r.status]}>{requestStatusLabel[r.status]}</ToneBadge>,
        extra: null,
        amount: r.kind === 'buyback' ? r.total : r.result_money,
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 6)
  }, [data])

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data) return <LoadingState />
  const { counts, leaderboard } = data
  const todo = data.need_report.length + data.unpaid_orders.length

  return (
    <PageStack>
      <PageHeader title={`Halo, ${user?.name}`} subtitle="Ringkasan aktivitasmu di Market, penjualan, dan pemrosesan." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Pesanan menunggu" value={formatNumber(counts.orders_pending)} hint="belum disetujui staff" icon={Receipt} />
        <Kpi
          label="Belum dibayar"
          value={formatMoney(counts.unpaid_total)}
          hint={counts.unpaid_count ? `${formatNumber(counts.unpaid_count)} pesanan` : 'tidak ada tagihan'}
          icon={Wallet}
        />
        <Kpi label="Perlu dilaporkan" value={formatNumber(counts.need_report)} hint="pengajuan disetujui" icon={ClipboardCheck} />
        <Kpi label="Belanja minggu ini" value={formatMoney(counts.spent_week)} hint="pesanan disetujui" icon={ShoppingBag} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SHORTCUTS.map(({ to, label, hint, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{label}</span>
              <span className="block truncate text-xs text-muted-foreground">{hint}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Perlu tindakanmu</CardTitle>
          </CardHeader>
          <CardContent>
            {todo === 0 ? (
              <EmptyState text="Tidak ada yang perlu dikerjakan" />
            ) : (
              <ul className="divide-y divide-border/60">
                {data.need_report.map((r) => (
                  <li key={`n${r.id}`}>
                    <Link to={kindPath[r.kind]} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-primary">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {requestKindLabel[r.kind]} #{r.id} disetujui
                        </span>
                        <span className="block text-xs text-muted-foreground">Laporkan hasilnya beserta bukti</span>
                      </span>
                      <ToneBadge tone="warn">Laporkan</ToneBadge>
                    </Link>
                  </li>
                ))}
                {data.unpaid_orders.map((o) => (
                  <li key={`u${o.id}`}>
                    <Link to="/orders" className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-primary">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">Pesanan #{o.id}</span>
                        <span className="block text-xs text-muted-foreground">{formatDateTime(o.created_at)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums">{formatMoney(o.total)}</span>
                        <ToneBadge tone="bad">Belum dibayar</ToneBadge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aktivitas terbaru</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <EmptyState text="Belum ada aktivitas" />
            ) : (
              <ul className="divide-y divide-border/60">
                {activity.map((a) => (
                  <li key={a.key}>
                    <Link to={a.to} className="flex items-center justify-between gap-2 py-2.5 text-sm hover:text-primary">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{a.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDateTime(a.at)}
                          {a.extra ? ` · ${a.extra}` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {a.amount !== null && a.amount > 0 ? <span className="tabular-nums">{formatMoney(a.amount)}</span> : null}
                        {a.badge}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          Peringkat minggu ini · {dayMonth(leaderboard.week_start)} – {dayMonth(leaderboard.week_end)} (Senin–Minggu, WIB)
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <Leaderboard title="Top Spender" rows={leaderboard.spenders} meId={user?.id} />
          <Leaderboard title="Top Seller" rows={leaderboard.sellers} meId={user?.id} />
        </div>
      </div>
    </PageStack>
  )
}
