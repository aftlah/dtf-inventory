import { useMemo, useState, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine } from 'lucide-react'
import {
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  LoadingState,
  PageHeader,
  PageStack,
  Select,
  Textarea,
} from '@/components/ui'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import type { Item, Location, StockRow } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'
import clsx from 'clsx'

type Mode = 'in' | 'out' | 'transfer'

const modes: { key: Mode; label: string; icon: typeof ArrowDownToLine }[] = [
  { key: 'in', label: 'Masuk', icon: ArrowDownToLine },
  { key: 'out', label: 'Keluar', icon: ArrowUpFromLine },
  { key: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
]

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

  const available = useMemo(() => {
    if (!itemId || !locationId) return null
    return (
      stock.data?.find((s) => s.item_id === Number(itemId) && s.location_id === Number(locationId))?.qty ?? 0
    )
  }, [stock.data, itemId, locationId])

  const error = items.error || locations.error || stock.error
  if (error) return <ErrorState message={error} />
  if (items.loading || locations.loading || stock.loading) return <LoadingState />

  const item = items.data?.find((i) => i.id === Number(itemId))
  const needsStock = mode !== 'in'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
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
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Tambahkan minimal satu barang dan satu lokasi dulu di menu Katalog Barang / Lokasi.
        </Card>
      ) : (
        <Card className="max-w-xl p-5">
          <div className="mb-5 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="tablist">
            {modes.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                onClick={() => setMode(key)}
                className={clsx(
                  'flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold transition-colors',
                  mode === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="Barang">
              <Select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
                <option value="">Pilih barang…</option>
                {items.data?.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={mode === 'transfer' ? 'Dari lokasi' : 'Lokasi'}>
              <Select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
                <option value="">Pilih lokasi…</option>
                {locations.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </Field>

            {mode === 'transfer' ? (
              <Field label="Ke lokasi">
                <Select value={toId} onChange={(e) => setToId(e.target.value)} required>
                  <option value="">Pilih lokasi tujuan…</option>
                  {locations.data
                    ?.filter((l) => String(l.id) !== locationId)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                </Select>
              </Field>
            ) : null}

            <Field
              label="Jumlah"
              hint={needsStock && available !== null ? `Tersedia: ${formatNumber(available)} ${item?.unit ?? ''}` : undefined}
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

            <Button type="submit" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </form>
        </Card>
      )}
    </PageStack>
  )
}
