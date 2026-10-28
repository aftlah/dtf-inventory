import { useEffect, useState } from 'react'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { formatDateTime, formatMoney } from '@/lib/format'
import type { AuditRow } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'

const PAGE = 50

const ENTITY: Record<string, string> = {
  item: 'Barang',
  location: 'Lokasi',
  user: 'Pengguna',
  order: 'Pesanan',
  request: 'Pengajuan',
  cash: 'Buku kas',
}

const ACTION: Record<string, { label: string; tone: 'default' | 'good' | 'bad' | 'warn' }> = {
  create: { label: 'Dibuat', tone: 'good' },
  update: { label: 'Diubah', tone: 'warn' },
  delete: { label: 'Dihapus', tone: 'bad' },
  approve: { label: 'Disetujui', tone: 'good' },
  reject: { label: 'Ditolak', tone: 'bad' },
  cancel: { label: 'Dibatalkan', tone: 'default' },
  report: { label: 'Dilaporkan', tone: 'warn' },
  confirm: { label: 'Dikonfirmasi', tone: 'good' },
  reopen: { label: 'Lapor ulang', tone: 'warn' },
  mark_paid: { label: 'Lunas', tone: 'good' },
  mark_unpaid: { label: 'Belum dibayar', tone: 'default' },
  wash_status: { label: 'Status uang', tone: 'warn' },
  password_change: { label: 'Ganti password', tone: 'default' },
  account_request: { label: 'Ajukan akun', tone: 'warn' },
  account_approve: { label: 'Akun disetujui', tone: 'good' },
  account_reject: { label: 'Akun ditolak', tone: 'bad' },
}

const FIELD: Record<string, string> = {
  name: 'Nama',
  username: 'Username',
  role: 'Role',
  active: 'Aktif',
  category: 'Kategori',
  unit: 'Satuan',
  min_stock: 'Stok minimum',
  notes: 'Catatan',
  price: 'Harga',
  cost_price: 'Harga modal',
  buyback_price: 'Harga beli',
  image_url: 'Gambar',
  in_market: 'Market',
  in_sale: 'Penjualan',
  in_process: 'Pemrosesan',
  in_buyback: 'Jual Barang',
  min_sale_qty: 'Min. penjualan',
  kind: 'Jenis',
  sell_in_market: 'Dijual di Market',
  total: 'Total',
  jenis_barang: 'Jenis barang',
  pembeli: 'Pembeli',
  pemohon: 'Pemohon',
  alasan: 'Alasan',
  uang: 'Uang',
  bukti: 'Bukti',
  kategori: 'Kategori',
  nominal: 'Nominal',
  sumber_tujuan: 'Sumber/tujuan',
  tanggal: 'Tanggal',
  jenis: 'Jenis',
  status: 'Status',
  status_sebelumnya: 'Sebelumnya',
  password: 'Password',
}
const BOOL = new Set(['active', 'in_market', 'in_sale', 'in_process', 'in_buyback', 'sell_in_market'])
const MONEY = new Set(['price', 'cost_price', 'buyback_price', 'total', 'uang', 'nominal'])

function fmt(key: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (BOOL.has(key)) return v ? 'ya' : 'tidak'
  if (MONEY.has(key) && typeof v === 'number') return formatMoney(v)
  return String(v)
}

function Changes({ row }: { row: AuditRow }) {
  // Snapshot pembuatan/penghapusan: sembunyikan nilai kosong; perubahan (lama → baru) selalu ditampilkan.
  const entries = Object.entries(row.changes ?? {}).filter(([, v]) => Array.isArray(v) || (v !== null && v !== ''))
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <ul className="space-y-0.5 text-xs">
      {entries.map(([key, value]) => (
        <li key={key} className="flex flex-wrap gap-x-1.5">
          <span className="text-muted-foreground">{FIELD[key] ?? key}:</span>
          {Array.isArray(value) && value.length === 2 ? (
            <span>
              <span className="text-rose-300 line-through decoration-rose-300/50">{fmt(key, value[0])}</span>
              {' → '}
              <span className="text-emerald-300">{fmt(key, value[1])}</span>
            </span>
          ) : (
            <span>{fmt(key, value)}</span>
          )}
        </li>
      ))}
    </ul>
  )
}

export function AuditPage() {
  const [entity, setEntity] = useState('')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)

  // Tunda pencarian sebentar agar tidak memanggil server di setiap ketukan.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, error, loading, reload } = useAsync(() => {
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) })
    if (entity) p.set('entity', entity)
    if (q) p.set('q', q)
    return api<{ rows: AuditRow[]; hasMore: boolean }>(`/audit?${p}`)
  }, [entity, q, page])

  return (
    <PageStack>
      <PageHeader title="Log Aktivitas" subtitle="Siapa mengubah apa dan kapan. Catatan ini tidak bisa diubah atau dihapus dari aplikasi.">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 sm:w-56" placeholder="Cari pelaku / objek…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <OptionSelect
          className="sm:w-44"
          value={entity}
          onChange={(v) => {
            setEntity(v)
            setPage(0)
          }}
          emptyLabel="Semua data"
          options={Object.entries(ENTITY).map(([value, label]) => ({ value, label }))}
        />
      </PageHeader>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingState />
      ) : !data || data.rows.length === 0 ? (
        <EmptyState text="Belum ada aktivitas tercatat" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Pelaku</TableHead>
                <TableHead>Aksi</TableHead>
                <TableHead>Objek</TableHead>
                <TableHead>Perubahan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r) => {
                const a = ACTION[r.action] ?? { label: r.action, tone: 'default' as const }
                return (
                  <TableRow key={r.id}>
                    <TableCell className="align-top whitespace-nowrap text-muted-foreground">{formatDateTime(r.created_at)}</TableCell>
                    <TableCell className="align-top">{r.actor_name}</TableCell>
                    <TableCell className="align-top">
                      <ToneBadge tone={a.tone}>{a.label}</ToneBadge>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className="text-xs text-muted-foreground">{ENTITY[r.entity] ?? r.entity}</span>
                      <span className="block font-medium">{r.entity_label ?? '—'}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <Changes row={r} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Sebelumnya
            </Button>
            <span className="text-xs text-muted-foreground">Halaman {page + 1}</span>
            <Button variant="outline" size="sm" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>
              Berikutnya
            </Button>
          </div>
        </>
      )}
    </PageStack>
  )
}
