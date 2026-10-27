import { ArrowDownToLine, ArrowUpFromLine, Boxes, MapPin, Package } from 'lucide-react'
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
import { formatDateTime, formatNumber, logTypeLabel } from '@/lib/format'
import type { Dashboard } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'

export function DashboardPage() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useAsync(() => api<Dashboard>('/dashboard'), [])

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data) return <LoadingState />
  const { counts, lowStock, recent } = data

  return (
    <PageStack>
      <PageHeader title={`Halo, ${user?.name}`} subtitle="Ringkasan inventory hari ini." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Jenis barang" value={formatNumber(counts.items)} icon={Package} />
        <Kpi label="Lokasi" value={formatNumber(counts.locations)} icon={MapPin} />
        <Kpi label="Total unit" value={formatNumber(counts.units)} icon={Boxes} />
        <Kpi label="Masuk hari ini" value={formatNumber(counts.in_today)} hint="transaksi" icon={ArrowDownToLine} />
        <Kpi label="Keluar hari ini" value={formatNumber(counts.out_today)} hint="transaksi" icon={ArrowUpFromLine} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stok menipis</CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <EmptyState text="Semua stok aman" />
            ) : (
              <ul className="divide-y divide-border/60">
                {lowStock.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="truncate font-medium">{i.name}</span>
                    <span className="flex shrink-0 items-center gap-2 tabular-nums">
                      <span className="font-semibold text-destructive">
                        {formatNumber(i.qty)} {i.unit}
                      </span>
                      <span className="text-xs text-muted-foreground">min {formatNumber(i.min_stock)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Aktivitas terbaru
              <Link to="/log" className="text-xs font-medium text-primary hover:underline">
                Lihat semua
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState text="Belum ada aktivitas" />
            ) : (
              <ul className="divide-y divide-border/60">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.item_name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.location_name} · {r.user_name} · {formatDateTime(r.created_at)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <ToneBadge tone={r.type === 'in' || r.type === 'transfer_in' ? 'good' : 'bad'}>
                        {logTypeLabel[r.type]}
                      </ToneBadge>
                      <span className="tabular-nums">
                        {formatNumber(r.qty)} {r.unit}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageStack>
  )
}
