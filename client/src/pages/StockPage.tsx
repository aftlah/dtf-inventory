import { useMemo, useState } from 'react'
import {
  Badge,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  PageStack,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui'
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
        <Input
          className="sm:w-56"
          placeholder="Cari barang / kategori"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select className="sm:w-48" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">Semua lokasi</option>
          {(locations.data ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Barang</Th>
              <Th>Kategori</Th>
              <Th className="text-right">Jumlah</Th>
              {!locationId ? <Th>Per lokasi</Th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, qty, perLoc }) => {
              const low = item.min_stock > 0 && qty <= item.min_stock
              return (
                <tr key={item.id}>
                  <Td className="font-medium">{item.name}</Td>
                  <Td className="text-muted-foreground">{item.category ?? '—'}</Td>
                  <Td className="text-right tabular-nums">
                    <span className={low ? 'font-semibold text-destructive' : undefined}>
                      {formatNumber(qty)} {item.unit}
                    </span>
                    {low ? (
                      <span className="ml-2">
                        <Badge tone="bad">Menipis</Badge>
                      </span>
                    ) : null}
                  </Td>
                  {!locationId ? (
                    <Td className="text-xs text-muted-foreground">
                      {[...perLoc.entries()]
                        .filter(([, q]) => q !== 0)
                        .map(([id, q]) => `${locName.get(id) ?? id}: ${formatNumber(q)}`)
                        .join(' · ') || '—'}
                    </Td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </PageStack>
  )
}
