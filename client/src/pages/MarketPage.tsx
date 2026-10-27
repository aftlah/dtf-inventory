import { useMemo, useState } from 'react'
import { Check, Loader2, Minus, Package, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingState, PageHeader, PageStack } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useCart } from '@/contexts/CartContext'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { formatNumber, formatMoney } from '@/lib/format'
import type { MarketItem } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

function ProductCard({ item }: { item: MarketItem }) {
  const cart = useCart()
  const inCart = cart.qty(item.id)
  const soldOut = item.available <= 0
  const [qty, setQty] = useState('1')

  const n = Math.floor(Number(qty) || 0)
  const clamp = (v: number) => Math.min(item.available, Math.max(1, v))

  const level = soldOut ? 'out' : item.available <= 5 ? 'low' : 'ok'
  const stockStyle = {
    out: 'bg-destructive/20 text-destructive ring-destructive/30',
    low: 'bg-amber-500/20 text-amber-300 ring-amber-500/30',
    ok: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25',
  }[level]

  return (
    <Card className={cn('gap-0 overflow-hidden py-0 transition-shadow', soldOut ? 'opacity-70' : 'hover:ring-primary/40', inCart && 'ring-primary/60')}>
      <div className="relative flex h-36 items-center justify-center bg-black/30">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} loading="lazy" className="h-full w-full object-contain p-3" />
        ) : (
          <Package className="size-10 text-muted-foreground/50" aria-hidden />
        )}
        <Badge variant="secondary" className="absolute top-2 left-2 bg-black/60 backdrop-blur">
          {item.category ?? '—'}
        </Badge>
        <span className={cn('absolute top-2 right-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 backdrop-blur', stockStyle)}>
          {soldOut ? 'Habis' : `Stok ${formatNumber(item.available)}`}
        </span>
        {inCart ? (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
            <Check className="size-3" aria-hidden /> {formatNumber(inCart)}
          </span>
        ) : null}
      </div>

      <CardContent className="flex flex-1 flex-col gap-3 p-3">
        <div className="space-y-0.5">
          <p className="leading-tight font-semibold">{item.name}</p>
          <p className="text-base leading-tight font-semibold text-primary">{formatMoney(item.price)}</p>
        </div>

        <div className="mt-auto space-y-2">
          {soldOut ? (
            <p className="rounded-lg bg-destructive/10 py-2 text-center text-sm font-medium text-destructive">Stok habis</p>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" aria-label="Kurangi" onClick={() => setQty(String(clamp(n - 1)))}>
                  <Minus />
                </Button>
                <Input
                  type="number"
                  inputMode="numeric"
                  className="text-center"
                  min={1}
                  max={item.available}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  onBlur={() => setQty(String(clamp(n || 1)))}
                  aria-label={`Jumlah ${item.name}`}
                />
                <Button variant="outline" size="icon" aria-label="Tambah" onClick={() => setQty(String(clamp(n + 1)))}>
                  <Plus />
                </Button>
              </div>
              <Button
                className="w-full"
                variant={inCart ? 'outline' : 'default'}
                onClick={() => cart.set(item.id, clamp(n || 1))}
              >
                <ShoppingCart /> {inCart ? `Ubah keranjang (${formatNumber(inCart)})` : 'Tambah ke keranjang'}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function MarketPage() {
  const navigate = useNavigate()
  const cart = useCart()
  const toast = useToast()
  const { data, error, loading, reload } = useAsync(() => api<MarketItem[]>('/market/items'), [])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const items = data ?? []
  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter((c): c is string => !!c))].sort(),
    [items],
  )
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => (!category || i.category === category) && (!q || i.name.toLowerCase().includes(q)))
  }, [items, search, category])

  const byId = new Map(items.map((i) => [i.id, i]))
  // Barang yang sudah tidak dijual lagi otomatis hilang dari keranjang.
  const cartLines = cart.lines
    .map((l) => ({ ...l, item: byId.get(l.item_id) }))
    .filter((l): l is typeof l & { item: MarketItem } => !!l.item)
  const total = cartLines.reduce((sum, l) => sum + l.item.price * l.qty, 0)

  async function checkout() {
    setBusy(true)
    try {
      await api('/orders', {
        method: 'POST',
        body: { lines: cartLines.map(({ item_id, qty }) => ({ item_id, qty })), note },
      })
      cart.clear()
      setNote('')
      setOpen(false)
      toast.success('Pesanan dikirim, menunggu persetujuan staff')
      navigate('/orders')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal membuat pesanan')
      reload()
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data) return <LoadingState />

  return (
    <PageStack>
      <PageHeader title="Market" subtitle="Pilih barang, masukkan ke keranjang, lalu kirim pesanan. Pesanan diproses setelah disetujui staff.">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 sm:w-52" placeholder="Cari barang…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          <ShoppingCart /> Keranjang {cart.count ? <Badge>{cart.count}</Badge> : null}
        </Button>
      </PageHeader>

      {categories.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {['', ...categories].map((c) => (
            <button
              key={c || 'all'}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                category === c
                  ? 'border-primary/50 bg-primary/15 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {c || 'Semua'}
            </button>
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState text={items.length === 0 ? 'Belum ada barang yang dijual' : 'Barang tidak ditemukan'} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <ProductCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {cart.count > 0 && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-30 flex items-center gap-3 rounded-full bg-primary py-2.5 pr-5 pl-4 font-semibold text-primary-foreground shadow-lg shadow-black/50 hover:bg-primary/90 sm:right-6 sm:bottom-6"
          aria-label="Buka keranjang"
        >
          <span className="relative">
            <ShoppingCart className="size-5" aria-hidden />
            <span className="absolute -top-2 -right-2 flex min-w-4 items-center justify-center rounded-full bg-black px-1 text-[10px] leading-4 font-bold text-white">
              {cart.count}
            </span>
          </span>
          <span className="text-sm">{formatMoney(total)}</span>
        </button>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Keranjang</SheetTitle>
            <SheetDescription>Periksa pesananmu sebelum dikirim.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-2 overflow-y-auto px-4">
            {cartLines.length === 0 ? (
              <EmptyState text="Keranjang kosong" />
            ) : (
              cartLines.map((l) => (
                <div key={l.item_id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                  {l.item.image_url ? (
                    <img src={l.item.image_url} alt="" className="size-10 shrink-0 rounded bg-black/30 object-contain" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(l.item.price)} × {formatNumber(l.qty)}
                    </p>
                  </div>
                  <Input
                    type="number"
                    inputMode="numeric"
                    className="w-20"
                    min={1}
                    max={l.item.available}
                    value={l.qty}
                    onChange={(e) =>
                      cart.set(l.item_id, Math.min(l.item.available, Math.max(0, Math.floor(Number(e.target.value) || 0))))
                    }
                    aria-label={`Jumlah ${l.item.name}`}
                  />
                  <Button variant="ghost" size="icon" aria-label={`Hapus ${l.item.name}`} onClick={() => cart.remove(l.item_id)}>
                    <Trash2 />
                  </Button>
                </div>
              ))
            )}
          </div>
          <SheetFooter>
            {cartLines.length ? (
              <>
                <Textarea placeholder="Catatan untuk staff (opsional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Total</span>
                  <span>{formatMoney(total)}</span>
                </div>
              </>
            ) : null}
            <Button disabled={busy || !cartLines.length} onClick={() => void checkout()} className="h-10">
              {busy ? <Loader2 className="animate-spin" /> : null} {busy ? 'Mengirim…' : 'Kirim pesanan'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Stok langsung dipesankan untukmu. Pesanan baru diproses setelah disetujui staff.
            </p>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageStack>
  )
}
