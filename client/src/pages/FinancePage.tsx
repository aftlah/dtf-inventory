import { useState } from 'react'
import { AlertTriangle, Banknote, Boxes, HandCoins, Percent, Receipt, TrendingUp, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  EmptyState,
  ErrorState,
  FilterTabs,
  Kpi,
  LoadingState,
  PageHeader,
  PageStack,
} from '@/components/common'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { dateRangeFor, PRESETS, type Preset } from '@/lib/period'
import type { FinanceReport } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

const profitClass = (n: number) => (n < 0 ? 'text-destructive' : 'text-emerald-300')

function Breakdown({ title, count, revenue, cogs }: { title: string; count: number; revenue: number; cogs: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {title}
          <span className="text-xs font-normal text-muted-foreground">{formatNumber(count)} transaksi</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Penjualan</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(revenue)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Modal</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(cogs)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Profit</dt>
            <dd className={cn('font-semibold tabular-nums', profitClass(revenue - cogs))}>{formatMoney(revenue - cogs)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}

export function FinancePage() {
  const [preset, setPreset] = useState<Preset>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const range = dateRangeFor(preset, customFrom, customTo)

  const qs = new URLSearchParams()
  if (range.from) qs.set('from', range.from)
  if (range.to) qs.set('to', range.to)
  const period = qs.toString()

  const { data, error, loading, reload } = useAsync(() => api<FinanceReport>(`/finance/report?${period}`), [period])

  const revenue = data ? data.orders_revenue + data.sales_revenue : 0
  const cogs = data ? data.orders_cogs + data.sales_cogs : 0
  const profit = revenue - cogs
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0
  const maxDay = data ? Math.max(...data.by_day.map((d) => Math.max(d.revenue, Math.abs(d.profit))), 1) : 1

  return (
    <PageStack>
      <PageHeader title="Laporan Keuangan" subtitle="Penjualan, modal (HPP), dan profit dari pesanan Market yang aktif (tidak dibatalkan) dan Penjualan yang dilaporkan.">
        <div className="flex flex-wrap items-center gap-3">
          <FilterTabs value={preset} onChange={(v) => setPreset(v as Preset)} tabs={PRESETS} label="Periode" />
          {preset === 'custom' ? (
            <div className="flex items-center gap-2">
              <Input type="date" className="w-40" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Dari tanggal" />
              <span className="text-muted-foreground">–</span>
              <Input type="date" className="w-40" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="Sampai tanggal" />
            </div>
          ) : null}
        </div>
      </PageHeader>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingState />
      ) : !data ? null : (
        <>
          {data.items_no_cost > 0 ? (
            <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                {data.items_no_cost} barang yang dijual belum punya harga modal, jadi profit bisa terlihat lebih besar dari aslinya.{' '}
                <Link to="/items" className="font-semibold underline underline-offset-2">
                  Isi di Katalog Barang
                </Link>
                .
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Penjualan" value={formatMoney(revenue)} icon={Banknote} />
            <Kpi label="Modal (HPP)" value={formatMoney(cogs)} icon={Receipt} />
            <Kpi label="Profit" value={formatMoney(profit)} icon={TrendingUp} />
            <Kpi label="Margin" value={`${margin}%`} icon={Percent} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Nilai stok (modal tertanam)" value={formatMoney(data.stock_value)} hint="stok saat ini × harga modal" icon={Boxes} />
            <Kpi label="Dibayar ke member" value={formatMoney(data.buyback_paid)} hint="Jual Barang selesai; tidak mengurangi profit" icon={HandCoins} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="Market" count={data.orders_count} revenue={data.orders_revenue} cogs={data.orders_cogs} />
            <Breakdown title="Penjualan" count={data.sales_count} revenue={data.sales_revenue} cogs={data.sales_cogs} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="size-4 text-muted-foreground" aria-hidden /> Per hari
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.by_day.length === 0 ? (
                <EmptyState text="Belum ada transaksi pada periode ini" />
              ) : (
                <ul className="space-y-3">
                  {[...data.by_day].reverse().map((d) => (
                    <li key={d.day}>
                      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm">
                        <span className="font-medium">{formatDate(d.day)}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatMoney(d.revenue)} − {formatMoney(d.cogs)} ={' '}
                          <span className={cn('font-semibold', profitClass(d.profit))}>{formatMoney(d.profit)}</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full', d.profit < 0 ? 'bg-rose-400/80' : 'bg-emerald-400/80')}
                          style={{ width: `${(Math.abs(d.profit) / maxDay) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {data.top_items.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold">Barang paling menguntungkan (Market)</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Barang</TableHead>
                    <TableHead className="text-right">Terjual</TableHead>
                    <TableHead className="text-right">Penjualan</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top_items.map((t) => (
                    <TableRow key={t.name}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(t.qty)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(t.revenue)}</TableCell>
                      <TableCell className={cn('text-right font-semibold tabular-nums', profitClass(t.profit))}>
                        {formatMoney(t.profit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </>
      )}
    </PageStack>
  )
}
