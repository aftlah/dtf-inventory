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
  cost_price: string
  image_url: string
  in_market: boolean
  in_sale: boolean
  in_process: boolean
  min_sale_qty: string
  in_buyback: boolean
  buyback_price: string
}
const empty: Draft = {
  name: '',
  category: '',
  unit: 'pcs',
  min_stock: '0',
  notes: '',
  price: '0',
  cost_price: '0',
  image_url: '',
  in_market: false,
  in_sale: false,
  in_process: false,
  min_sale_qty: '1',
  in_buyback: false,
  buyback_price: '0',
}
type TextKey = 'name' | 'category' | 'unit' | 'min_stock' | 'notes' | 'price' | 'cost_price' | 'image_url' | 'min_sale_qty' | 'buyback_price'

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
      const body = {
        ...draft,
        min_stock: Number(draft.min_stock),
        price: Number(draft.price),
        cost_price: Number(draft.cost_price) || 0,
        min_sale_qty: Number(draft.min_sale_qty) || 1,
        buyback_price: Number(draft.buyback_price) || 0,
      }
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
              <TableHead>Tersedia di</TableHead>
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
                  <div className="flex flex-wrap gap-1">
                    {i.in_market ? <ToneBadge tone="good">Market</ToneBadge> : null}
                    {i.in_sale ? <ToneBadge tone="warn">Penjualan</ToneBadge> : null}
                    {i.in_process ? <ToneBadge tone="warn">Pemrosesan</ToneBadge> : null}
                    {i.in_buyback ? <ToneBadge tone="warn">Jual Barang</ToneBadge> : null}
                    {!i.in_market && !i.in_sale && !i.in_process && !i.in_buyback ? <span className="text-muted-foreground">—</span> : null}
                  </div>
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
                            cost_price: String(i.cost_price),
                            image_url: i.image_url ?? '',
                            in_market: i.in_market,
                            in_sale: i.in_sale,
                            in_process: i.in_process,
                            min_sale_qty: String(i.min_sale_qty),
                            in_buyback: i.in_buyback,
                            buyback_price: String(i.buyback_price),
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
                <Field label="Harga modal ($)" hint="Untuk menghitung profit di Laporan Keuangan.">
                  <Input type="number" min={0} step={1} value={draft.cost_price} onChange={set('cost_price')} required />
                </Field>
              </div>
              <Field label="Gambar" hint="Contoh: /items/smg.png atau URL.">
                <Input value={draft.image_url} onChange={set('image_url')} maxLength={255} placeholder="/items/…" />
              </Field>
              <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-muted-foreground">Tersedia untuk</p>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="item-market"
                    checked={draft.in_market}
                    onCheckedChange={(v) => setDraft({ ...draft, in_market: v === true })}
                    className="mt-0.5"
                  />
                  <Label htmlFor="item-market" className="flex-col items-start gap-0.5">
                    Market
                    <span className="text-xs font-normal text-muted-foreground">
                      Dibeli member. Harga harus lebih dari 0.
                    </span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="item-sale"
                    checked={draft.in_sale}
                    onCheckedChange={(v) => setDraft({ ...draft, in_sale: v === true })}
                    className="mt-0.5"
                  />
                  <Label htmlFor="item-sale" className="flex-col items-start gap-0.5">
                    Penjualan
                    <span className="text-xs font-normal text-muted-foreground">
                      Member bisa mengajukan barang ini untuk dijual.
                    </span>
                  </Label>
                </div>
                {draft.in_sale ? (
                  <Field label="Minimal jumlah per pengajuan penjualan">
                    <Input type="number" min={1} step={1} value={draft.min_sale_qty} onChange={set('min_sale_qty')} required />
                  </Field>
                ) : null}
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="item-process"
                    checked={draft.in_process}
                    onCheckedChange={(v) => setDraft({ ...draft, in_process: v === true })}
                    className="mt-0.5"
                  />
                  <Label htmlFor="item-process" className="flex-col items-start gap-0.5">
                    Pemrosesan
                    <span className="text-xs font-normal text-muted-foreground">
                      Member bisa mengajukan barang ini sebagai bahan pemrosesan.
                    </span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="item-buyback"
                    checked={draft.in_buyback}
                    onCheckedChange={(v) => setDraft({ ...draft, in_buyback: v === true })}
                    className="mt-0.5"
                  />
                  <Label htmlFor="item-buyback" className="flex-col items-start gap-0.5">
                    Jual Barang
                    <span className="text-xs font-normal text-muted-foreground">
                      Member menjual barang ini ke toko dengan harga beli tetap.
                    </span>
                  </Label>
                </div>
                {draft.in_buyback ? (
                  <Field label="Harga beli toko per unit ($)">
                    <Input type="number" min={1} step={1} value={draft.buyback_price} onChange={set('buyback_price')} required />
                  </Field>
                ) : null}
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
