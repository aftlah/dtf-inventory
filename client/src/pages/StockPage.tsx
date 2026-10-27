import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  OptionSelect,
  PageHeader,
  PageStack,
  ToneBadge,
} from '@/components/common'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import type { Item, Location, StockRow } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'

export function StockPage() {
  const items = useAsync(() => api<Item[]>('/items'), [])
  const locations = useAsync(() => api<Location[]>('/locations'), [])
  const stock = useAsync(() => api<StockRow[]>('/stock'), [])
  const [search, setSearch] = useState('')
  const [locationId, setLocationId] = useState('')

  const rows = useMemo(() => {
    const byItem = new Map<number, Map<number, number>>()
    for (const s of stock.data ?? []) {
      const m = byItem.get(s.item_id) ?? new Map<number, number>()
      m.set(s.location_id, s.qty)
      byItem.set(s.item_id, m)
    }
    const q = search.trim().toLowerCase()
    const locId = Number(locationId) || 0
    return (items.data ?? [])
      .filter((i) => !q || i.name.toLowerCase().includes(q) || (i.category ?? '').toLowerCase().includes(q))
      .map((item) => {
        const perLoc = byItem.get(item.id) ?? new Map<number, number>()
        const qty = locId ? (perLoc.get(locId) ?? 0) : [...perLoc.values()].reduce((a, b) => a + b, 0)
        return { item, qty, perLoc }
      })
  }, [items.data, stock.data, search, locationId])

  const error = items.error || locations.error || stock.error
  if (error) return <ErrorState message={error} />
  if (items.loading || locations.loading || stock.loading) return <LoadingState />

  const locName = new Map((locations.data ?? []).map((l) => [l.id, l.name]))

  return (
    <PageStack>
      <PageHeader title="Stok" subtitle="Stok dihitung dari seluruh riwayat masuk, keluar, dan transfer.">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 sm:w-56"
            placeholder="Cari barang / kategori"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <OptionSelect
          className="sm:w-48"
          value={locationId}
          onChange={setLocationId}
          emptyLabel="Semua lokasi"
          options={(locations.data ?? []).map((l) => ({ value: String(l.id), label: l.name }))}
        />
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Barang</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              {!locationId ? <TableHead>Per lokasi</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ item, qty, perLoc }) => {
              const low = item.min_stock > 0 && qty <= item.min_stock
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.category ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={low ? 'font-semibold text-destructive' : undefined}>
                      {formatNumber(qty)} {item.unit}
                    </span>
                    {low ? (
                      <span className="ml-2">
                        <ToneBadge tone="bad">Menipis</ToneBadge>
                      </span>
                    ) : null}
                  </TableCell>
                  {!locationId ? (
                    <TableCell className="text-xs text-muted-foreground">
                      {[...perLoc.entries()]
                        .filter(([, q]) => q !== 0)
                        .map(([id, q]) => `${locName.get(id) ?? id}: ${formatNumber(q)}`)
                        .join(' · ') || '—'}
                    </TableCell>
                  ) : null}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </PageStack>
  )
}
