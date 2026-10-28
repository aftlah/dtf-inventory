import { useMemo, useState, type FormEvent } from 'react'
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpFromLine,
  Loader2,
  Minus,
  Package,
  Plus,
  type LucideIcon,
} from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { formatDateTime, formatMoney, formatNumber, logTypeLabel } from '@/lib/format'
import type { Item, Location, LogRow, StockRow } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

type Mode = 'in' | 'out' | 'transfer'

const MODES: {
  key: Mode
  label: string
  hint: string
  icon: LucideIcon
  active: string
  button: string
}[] = [
  {
    key: 'in',
    label: 'Masuk',
    hint: 'Tambah stok',
    icon: ArrowDownToLine,
    active: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300',
    button: 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400',
  },
  {
    key: 'out',
    label: 'Keluar',
    hint: 'Kurangi stok',
    icon: ArrowUpFromLine,
    active: 'border-rose-500/60 bg-rose-500/10 text-rose-300',
    button: 'bg-rose-500 text-white hover:bg-rose-400',
  },
  {
    key: 'transfer',
    label: 'Transfer',
    hint: 'Pindah lokasi',
    icon: ArrowLeftRight,
    active: 'border-sky-500/60 bg-sky-500/10 text-sky-300',
    button: 'bg-sky-500 text-sky-950 hover:bg-sky-400',
  },
]

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

  const activeMode = MODES.find((m) => m.key === mode)!
  const qtyNum = Number(qty) || 0
  const maxQty = needsStock && available !== null ? available : undefined
  const clampQty = (n: number) => Math.max(1, maxQty !== undefined ? Math.min(n, Math.max(maxQty, 1)) : n)
  const bump = (d: number) => setQty(String(clampQty(qtyNum + d)))
  const overStock = needsStock && available !== null && qtyNum > available
  const locName = (id: string) => locations.data?.find((l) => String(l.id) === id)?.name ?? ''

  // Ringkasan sebelum menyimpan: apa yang akan dicatat dan stok setelahnya.
  const ready = item && locationId && qtyNum > 0 && (mode !== 'transfer' || toId)
  const what = item ? `${formatNumber(qtyNum)} ${item.unit} ${item.name}` : ''
  const summary = ready
    ? {
        in: `${what} masuk ke ${locName(locationId)}`,
        out: `${what} keluar dari ${locName(locationId)}`,
        transfer: `${what} dipindah dari ${locName(locationId)} ke ${locName(toId)}`,
      }[mode]
    : null
  const after = ready && available !== null ? (mode === 'in' ? available + qtyNum : available - qtyNum) : null

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
          <CardContent className="flex flex-col gap-6">
            <div role="radiogroup" aria-label="Jenis transaksi" className="grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.key}
                  onClick={() => setMode(m.key)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    mode === m.key
                      ? m.active
                      : 'border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                >
                  <m.icon className="size-5" aria-hidden />
                  <span className="text-sm font-semibold">{m.label}</span>
                  <span className="text-[11px] opacity-80">{m.hint}</span>
                </button>
              ))}
            </div>

            <form onSubmit={onSubmit} className="flex flex-col gap-6">
              <section className="flex flex-col gap-4">
                <h3 className="text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase">Barang &amp; lokasi</h3>
                <Field label="Barang">
                  <OptionSelect
                    value={itemId}
                    onChange={setItemId}
                    searchable
                    placeholder="Pilih barang…"
                    options={(items.data ?? []).map((i) => ({ value: String(i.id), label: i.name, image: i.image_url }))}
                  />
                </Field>

                {mode === 'transfer' ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                    <Field label="Dari lokasi">
                      <OptionSelect searchable value={locationId} onChange={setLocationId} placeholder="Asal…" options={locOptions} />
                    </Field>
                    <ArrowRight className="mb-2.5 size-4 text-muted-foreground" aria-hidden />
                    <Field label="Ke lokasi">
                      <OptionSelect
                        value={toId}
                        onChange={setToId}
                        searchable
                        placeholder="Tujuan…"
                        options={locOptions.filter((o) => o.value !== locationId)}
                      />
                    </Field>
                  </div>
                ) : (
                  <Field label="Lokasi">
                    <OptionSelect searchable value={locationId} onChange={setLocationId} placeholder="Pilih lokasi…" options={locOptions} />
                  </Field>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-[11px] font-bold tracking-[0.18em] text-muted-foreground uppercase">Jumlah</h3>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon-lg" aria-label="Kurangi" onClick={() => bump(-1)}>
                    <Minus />
                  </Button>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={maxQty !== undefined ? Math.max(maxQty, 1) : undefined}
                    step={1}
                    placeholder="0"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    required
                    aria-label="Jumlah"
                    className="h-11 text-center text-xl font-bold tabular-nums"
                  />
                  <Button type="button" variant="outline" size="icon-lg" aria-label="Tambah" onClick={() => bump(1)}>
                    <Plus />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[5, 10, 50, 100].map((n) => (
                    <Button key={n} type="button" variant="secondary" size="sm" onClick={() => bump(n)}>
                      +{n}
                    </Button>
                  ))}
                  {needsStock && available ? (
                    <Button type="button" variant="secondary" size="sm" onClick={() => setQty(String(available))}>
                      Semua ({formatNumber(available)})
                    </Button>
                  ) : null}
                </div>
                {available !== null ? (
                  <p className={cn('text-xs', overStock ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                    {overStock
                      ? `Melebihi stok: tersedia ${formatNumber(available)} ${item?.unit ?? ''}`
                      : `Stok saat ini di lokasi: ${formatNumber(available)} ${item?.unit ?? ''}`}
                  </p>
                ) : null}
              </section>

              <section className="flex flex-col gap-4">
                <Field label="Catatan (opsional)">
                  <Textarea
                    rows={2}
                    maxLength={500}
                    className="min-h-16"
                    placeholder="Mis. restock dari supplier, dipakai event…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </Field>

                {summary ? (
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
                    <p className="font-medium">{summary}</p>
                    {after !== null ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Stok di {locName(locationId)} jadi {formatNumber(after)} {item?.unit}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <Button type="submit" disabled={busy || overStock} className={cn('h-11 text-sm font-semibold', activeMode.button)}>
                  {busy ? <Loader2 className="animate-spin" /> : <activeMode.icon />}{' '}
                  {busy ? 'Menyimpan…' : `Catat ${activeMode.label.toLowerCase()}`}
                </Button>
              </section>
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
