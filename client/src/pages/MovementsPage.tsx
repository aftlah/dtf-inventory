import { useMemo, useState, type FormEvent } from 'react'
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Loader2 } from 'lucide-react'
import {
  ErrorState,
  Field,
  LoadingState,
  OptionSelect,
  PageHeader,
  PageStack,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { formatNumber } from '@/lib/format'
import type { Item, Location, StockRow } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'

type Mode = 'in' | 'out' | 'transfer'

const tabClass =
  'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none'

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
        <Card className="max-w-xl">
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
      )}
    </PageStack>
  )
}
