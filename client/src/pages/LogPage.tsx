import { useState } from 'react'
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PageStack,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui'
import { api } from '@/lib/api'
import { formatDateTime, formatNumber, logTypeLabel } from '@/lib/format'
import type { Item, Location, LogRow } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'

const PAGE = 50

export function LogPage() {
  const items = useAsync(() => api<Item[]>('/items'), [])
  const locations = useAsync(() => api<Location[]>('/locations'), [])
  const [itemId, setItemId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(0)

  const logs = useAsync(() => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) })
    if (itemId) p.set('item_id', itemId)
    if (locationId) p.set('location_id', locationId)
    if (type) p.set('type', type)
    return api<{ rows: LogRow[]; hasMore: boolean }>(`/logs?${p}`)
  }, [itemId, locationId, type, page])

  const filter = (setter: (v: string) => void) => (e: { target: { value: string } }) => {
    setter(e.target.value)
    setPage(0)
  }

  return (
    <PageStack>
      <PageHeader title="Riwayat" subtitle="Semua pergerakan barang. Riwayat tidak bisa diubah atau dihapus.">
        <Select className="sm:w-44" value={itemId} onChange={filter(setItemId)}>
          <option value="">Semua barang</option>
          {items.data?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
        <Select className="sm:w-40" value={locationId} onChange={filter(setLocationId)}>
          <option value="">Semua lokasi</option>
          {locations.data?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Select className="sm:w-40" value={type} onChange={filter(setType)}>
          <option value="">Semua tipe</option>
          {Object.entries(logTypeLabel).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </PageHeader>

      {logs.error ? (
        <ErrorState message={logs.error} onRetry={logs.reload} />
      ) : logs.loading || !logs.data ? (
        <LoadingState />
      ) : logs.data.rows.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Waktu</Th>
                <Th>Barang</Th>
                <Th>Lokasi</Th>
                <Th>Tipe</Th>
                <Th className="text-right">Jumlah</Th>
                <Th>Oleh</Th>
                <Th>Catatan</Th>
              </tr>
            </thead>
            <tbody>
              {logs.data.rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.created_at)}</Td>
                  <Td className="font-medium">{r.item_name}</Td>
                  <Td>{r.location_name}</Td>
                  <Td>
                    <Badge tone={r.type === 'in' || r.type === 'transfer_in' ? 'good' : 'bad'}>
                      {logTypeLabel[r.type]}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {r.type === 'in' || r.type === 'transfer_in' ? '+' : '−'}
                    {formatNumber(r.qty)} {r.unit}
                  </Td>
                  <Td>{r.user_name}</Td>
                  <Td className="max-w-56 truncate text-muted-foreground" title={r.note ?? undefined}>
                    {r.note ?? '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Sebelumnya
            </Button>
            <span className="text-xs text-muted-foreground">Halaman {page + 1}</span>
            <Button variant="outline" size="sm" disabled={!logs.data.hasMore} onClick={() => setPage((p) => p + 1)}>
              Berikutnya
            </Button>
          </div>
        </>
      )}
    </PageStack>
  )
}
