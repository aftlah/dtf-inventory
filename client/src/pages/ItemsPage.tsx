import { useState, type FormEvent } from 'react'
import { Loader2, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { EmptyState, ErrorState, Field, LoadingState, PageHeader, PageStack, ToneBadge } from '@/components/common'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { formatNumber, formatMoney } from '@/lib/format'
import type { Item } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'

type Draft = {
  id?: number
  name: string
  category: string
  unit: string
  min_stock: string
  notes: string
  price: string
  image_url: string
  in_market: boolean
}
const empty: Draft = {
  name: '',
  category: '',
  unit: 'pcs',
  min_stock: '0',
  notes: '',
  price: '0',
  image_url: '',
  in_market: false,
}
type TextKey = 'name' | 'category' | 'unit' | 'min_stock' | 'notes' | 'price' | 'image_url'

export function ItemsPage() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, error, loading, reload } = useAsync(() => api<Item[]>('/items'), [])
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data) return <LoadingState />

  const q = search.trim().toLowerCase()
  const rows = data.filter((i) => !q || i.name.toLowerCase().includes(q) || (i.category ?? '').toLowerCase().includes(q))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    setBusy(true)
    try {
      const body = { ...draft, min_stock: Number(draft.min_stock), price: Number(draft.price) }
      if (draft.id) await api(`/items/${draft.id}`, { method: 'PUT', body })
      else await api('/items', { method: 'POST', body })
      toast.success('Tersimpan')
      setDraft(null)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setBusy(false)
    }
  }

  async function remove(item: Item) {
    const ok = await confirm({
      title: `Hapus "${item.name}"?`,
      description: 'Barang hilang dari katalog. Riwayat lama tetap tersimpan.',
      confirmLabel: 'Hapus',
    })
    if (!ok) return
    try {
      await api(`/items/${item.id}`, { method: 'DELETE' })
      toast.success('Dihapus')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus')
    }
  }

  const set = (k: TextKey) => (e: { target: { value: string } }) =>
    setDraft((d) => (d ? { ...d, [k]: e.target.value } : d))

  return (
    <PageStack>
      <PageHeader title="Katalog Barang" subtitle="Daftar barang yang dikelola di inventory.">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 sm:w-56" placeholder="Cari…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {isAdmin ? (
          <Button onClick={() => setDraft(empty)}>
            <Plus /> Tambah barang
          </Button>
        ) : null}
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Satuan</TableHead>
              <TableHead className="text-right">Harga</TableHead>
              <TableHead>Market</TableHead>
              <TableHead className="text-right">Stok minimum</TableHead>
              {isAdmin ? <TableHead className="w-24" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded bg-black/30">
                      {i.image_url ? (
                        <img src={i.image_url} alt="" loading="lazy" className="size-full object-contain" />
                      ) : (
                        <Package className="size-4 text-muted-foreground/60" aria-hidden />
                      )}
                    </span>
                    <span className="font-medium">{i.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{i.category ?? '—'}</TableCell>
                <TableCell>{i.unit}</TableCell>
                <TableCell className="text-right tabular-nums">{i.price > 0 ? formatMoney(i.price) : '—'}</TableCell>
                <TableCell>
                  <ToneBadge tone={i.in_market ? 'good' : 'default'}>{i.in_market ? 'Dijual' : 'Tidak'}</ToneBadge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(i.min_stock)}</TableCell>
                {isAdmin ? (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Ubah ${i.name}`}
                        onClick={() =>
                          setDraft({
                            id: i.id,
                            name: i.name,
                            category: i.category ?? '',
                            unit: i.unit,
                            min_stock: String(i.min_stock),
                            notes: i.notes ?? '',
                            price: String(i.price),
                            image_url: i.image_url ?? '',
                            in_market: i.in_market,
                          })
                        }
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Hapus ${i.name}`}
                        onClick={() => remove(i)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Ubah barang' : 'Tambah barang'}</DialogTitle>
            <DialogDescription>Data barang yang tampil di katalog dan stok.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="item-form" onSubmit={save} className="flex flex-col gap-4">
              <Field label="Nama">
                <Input value={draft.name} onChange={set('name')} maxLength={150} required autoFocus />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kategori">
                  <Input value={draft.category} onChange={set('category')} maxLength={60} />
                </Field>
                <Field label="Satuan">
                  <Input value={draft.unit} onChange={set('unit')} maxLength={20} required />
                </Field>
              </div>
              <Field label="Stok minimum" hint="Peringatan stok menipis muncul bila stok ≤ angka ini. 0 = tanpa peringatan.">
                <Input type="number" min={0} step={1} value={draft.min_stock} onChange={set('min_stock')} required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Harga jual ($)">
                  <Input type="number" min={0} step={1} value={draft.price} onChange={set('price')} required />
                </Field>
                <Field label="Gambar" hint="Contoh: /items/smg.png atau URL.">
                  <Input value={draft.image_url} onChange={set('image_url')} maxLength={255} placeholder="/items/…" />
                </Field>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="item-market"
                  checked={draft.in_market}
                  onCheckedChange={(v) => setDraft({ ...draft, in_market: v === true })}
                  className="mt-0.5"
                />
                <Label htmlFor="item-market" className="flex-col items-start gap-0.5">
                  Dijual di Market
                  <span className="text-xs font-normal text-muted-foreground">
                    Harga harus lebih dari 0 agar tampil di Market.
                  </span>
                </Label>
              </div>
              <Field label="Catatan">
                <Textarea value={draft.notes} onChange={set('notes')} maxLength={500} />
              </Field>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Batal
            </Button>
            <Button type="submit" form="item-form" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageStack>
  )
}
