import { useState } from 'react'
import {
  EmptyState,
  ErrorState,
  LoadingState,
  OptionSelect,
  PageHeader,
  PageStack,
  ToneBadge,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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

  const filter = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    setPage(0)
  }

  return (
    <PageStack>
      <PageHeader title="Riwayat" subtitle="Semua pergerakan barang. Riwayat tidak bisa diubah atau dihapus.">
        <OptionSelect
          className="sm:w-44"
          value={itemId}
          onChange={filter(setItemId)}
          emptyLabel="Semua barang"
          options={(items.data ?? []).map((i) => ({ value: String(i.id), label: i.name }))}
        />
        <OptionSelect
          className="sm:w-40"
          value={locationId}
          onChange={filter(setLocationId)}
          emptyLabel="Semua lokasi"
          options={(locations.data ?? []).map((l) => ({ value: String(l.id), label: l.name }))}
        />
        <OptionSelect
          className="sm:w-40"
          value={type}
          onChange={filter(setType)}
          emptyLabel="Semua tipe"
          options={Object.entries(logTypeLabel).map(([value, label]) => ({ value, label }))}
        />
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
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Barang</TableHead>
                <TableHead>Lokasi</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead>Oleh</TableHead>
                <TableHead>Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.data.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(r.created_at)}
                  </TableCell>
                  <TableCell className="font-medium">{r.item_name}</TableCell>
                  <TableCell>{r.location_name}</TableCell>
                  <TableCell>
                    <ToneBadge tone={r.type === 'in' || r.type === 'transfer_in' ? 'good' : 'bad'}>
                      {logTypeLabel[r.type]}
                    </ToneBadge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.type === 'in' || r.type === 'transfer_in' ? '+' : '−'}
                    {formatNumber(r.qty)} {r.unit}
                  </TableCell>
                  <TableCell>{r.user_name}</TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground" title={r.note ?? undefined}>
                    {r.note ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
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
