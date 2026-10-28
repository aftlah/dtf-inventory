import { useMemo, useState, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Loader2, Package } from 'lucide-react'
import {
  ErrorState,
  Field,
  LoadingState,
  OptionSelect,
  PageHeader,
  PageStack,
  ToneBadge,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { formatDateTime, formatMoney, formatNumber, logTypeLabel } from '@/lib/format'
import type { Item, Location, LogRow, StockRow } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

type Mode = 'in' | 'out' | 'transfer'

const tabClass =
  'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none'

// Panel kanan: ringkasan barang yang sedang dipilih (gambar, stok per lokasi, 5 transaksi terakhir).
function ItemPanel({
  item,
  locations,
  stock,
  locationId,
  toId,
  refresh,
}: {
  item: Item | undefined
  locations: Location[]
  stock: StockRow[]
  locationId: number
  toId: number
  refresh: number
}) {
  const itemId = item?.id
  const logs = useAsync(
    () => (itemId ? api<{ rows: LogRow[] }>(`/logs?item_id=${itemId}&limit=5`) : Promise.resolve(null)),
    [itemId, refresh],
  )

  if (!item) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
          <Package className="size-8 opacity-50" aria-hidden />
          Pilih barang untuk melihat stok per lokasi dan transaksi terakhirnya.
        </CardContent>
      </Card>
    )
  }

  const qtyAt = (locId: number) => stock.find((s) => s.item_id === item.id && s.location_id === locId)?.qty ?? 0
  const total = locations.reduce((sum, l) => sum + qtyAt(l.id), 0)
  const low = item.min_stock > 0 && total <= item.min_stock

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex items-center gap-4 border-b border-border p-4">
        <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/30">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="size-full object-contain p-1" />
          ) : (
            <Package className="size-8 text-muted-foreground/50" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg leading-tight font-bold">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            {item.category ?? 'Tanpa kategori'}
            {item.price > 0 ? ` · ${formatMoney(item.price)}` : ''}
          </p>
          <p className="mt-1.5 flex items-center gap-2">
            <span className={cn('text-2xl font-bold tabular-nums', low && 'text-destructive')}>{formatNumber(total)}</span>
            <span className="text-sm text-muted-foreground">{item.unit} total</span>
            {low ? <ToneBadge tone="bad">Menipis</ToneBadge> : null}
          </p>
        </div>
      </div>

      <div className="border-b border-border p-4">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Stok per lokasi</p>
        <ul className="space-y-1">
          {locations.map((l) => {
            const q = qtyAt(l.id)
            const role = l.id === locationId ? (toId ? 'Asal' : 'Dipilih') : l.id === toId ? 'Tujuan' : null
            return (
              <li
                key={l.id}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm',
                  role ? 'bg-primary/10 ring-1 ring-primary/30' : 'bg-muted/40',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{l.name}</span>
                  {role ? <span className="text-[10px] font-semibold tracking-wide text-primary uppercase">{role}</span> : null}
                </span>
                <span className={cn('shrink-0 tabular-nums', q === 0 && 'text-muted-foreground')}>
                  {formatNumber(q)} {item.unit}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="p-4">
        <p className="mb-2 text-xs font-semibold text-muted-foreground">Transaksi terakhir</p>
        {logs.loading && !logs.data ? (
          <Skeleton className="h-24 w-full" />
        ) : !logs.data?.rows.length ? (
          <p className="py-3 text-sm text-muted-foreground">Belum ada transaksi untuk barang ini.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {logs.data.rows.map((r) => {
              const incoming = r.type === 'in' || r.type === 'transfer_in'
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">
                      {r.location_name} · {r.user_name}
                    </span>
                    <span className="block text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <ToneBadge tone={incoming ? 'good' : 'bad'}>{logTypeLabel[r.type]}</ToneBadge>
                    <span className="w-14 text-right tabular-nums">
                      {incoming ? '+' : '−'}
                      {formatNumber(r.qty)}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}

export function MovementsPage() {
  const toast = useToast()
  const items = useAsync(() => api<Item[]>('/items'), [])
  const locations = useAsync(() => api<Location[]>('/locations'), [])
  const stock = useAsync(() => api<StockRow[]>('/stock'), [])

  const [mode, setMode] = useState<Mode>('in')
  const [itemId, setItemId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [toId, setToId] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)

  const available = useMemo(() => {
    if (!itemId || !locationId) return null
    return stock.data?.find((s) => s.item_id === Number(itemId) && s.location_id === Number(locationId))?.qty ?? 0
  }, [stock.data, itemId, locationId])

  const error = items.error || locations.error || stock.error
  if (error) return <ErrorState message={error} />
  if (items.loading || locations.loading || stock.loading) return <LoadingState />

  const item = items.data?.find((i) => i.id === Number(itemId))
  const needsStock = mode !== 'in'
  const locOptions = (locations.data ?? []).map((l) => ({ value: String(l.id), label: l.name }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!itemId || !locationId || (mode === 'transfer' && !toId)) {
      toast.error('Lengkapi barang dan lokasi dulu')
      return
    }
    setBusy(true)
    try {
      await api('/movements', {
        method: 'POST',
        body: {
          type: mode,
          item_id: Number(itemId),
          location_id: Number(locationId),
          to_location_id: mode === 'transfer' ? Number(toId) : undefined,
          qty: Number(qty),
          note,
        },
      })
      toast.success('Tersimpan')
      setQty('')
      setNote('')
      stock.reload()
      setRefresh((n) => n + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setBusy(false)
    }
  }

  const noCatalog = !items.data?.length || !locations.data?.length

  return (
    <PageStack>
      <PageHeader title="Masuk / Keluar" subtitle="Catat barang masuk, keluar, atau pindah antar lokasi." />

      {noCatalog ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Tambahkan minimal satu barang dan satu lokasi dulu di menu Katalog Barang / Lokasi.
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)]">
        <Card>
          <CardContent className="flex flex-col gap-5">
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="in" className={tabClass}>
                  <ArrowDownToLine /> Masuk
                </TabsTrigger>
                <TabsTrigger value="out" className={tabClass}>
                  <ArrowUpFromLine /> Keluar
                </TabsTrigger>
                <TabsTrigger value="transfer" className={tabClass}>
                  <ArrowLeftRight /> Transfer
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <Field label="Barang">
                <OptionSelect
                  value={itemId}
                  onChange={setItemId}
                  placeholder="Pilih barang…"
                  options={(items.data ?? []).map((i) => ({ value: String(i.id), label: i.name }))}
                />
              </Field>

              <Field label={mode === 'transfer' ? 'Dari lokasi' : 'Lokasi'}>
                <OptionSelect value={locationId} onChange={setLocationId} placeholder="Pilih lokasi…" options={locOptions} />
              </Field>

              {mode === 'transfer' ? (
                <Field label="Ke lokasi">
                  <OptionSelect
                    value={toId}
                    onChange={setToId}
                    placeholder="Pilih lokasi tujuan…"
                    options={locOptions.filter((o) => o.value !== locationId)}
                  />
                </Field>
              ) : null}

              <Field
                label="Jumlah"
                hint={
                  needsStock && available !== null
                    ? `Tersedia: ${formatNumber(available)} ${item?.unit ?? ''}`
                    : undefined
                }
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={needsStock && available !== null ? Math.max(available, 1) : undefined}
                  step={1}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  required
                />
              </Field>

              <Field label="Catatan (opsional)">
                <Textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>

              <Button type="submit" disabled={busy} className="h-10">
                {busy ? <Loader2 className="animate-spin" /> : null} {busy ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <ItemPanel
          item={item}
          locations={locations.data ?? []}
          stock={stock.data ?? []}
          locationId={Number(locationId) || 0}
          toId={mode === 'transfer' ? Number(toId) || 0 : 0}
          refresh={refresh}
        />
        </div>
      )}
    </PageStack>
  )
}
