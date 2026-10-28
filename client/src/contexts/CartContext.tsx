import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'

// Satu keranjang per jenis: belanja Market, ajukan Penjualan, Pemrosesan, dan Jual Barang.
export type CartKind = 'market' | 'sale' | 'process' | 'buyback'
type Carts = Record<CartKind, Record<number, number>>

const EMPTY: Carts = { market: {}, sale: {}, process: {}, buyback: {} }

type CartApi = {
  qty: (kind: CartKind, itemId: number) => number
  count: (kind: CartKind) => number
  lines: (kind: CartKind) => { item_id: number; qty: number }[]
  set: (kind: CartKind, itemId: number, qty: number) => void
  remove: (kind: CartKind, itemId: number) => void
  clear: (kind: CartKind) => void
}

const CartContext = createContext<CartApi | null>(null)

const storageKey = (userId: number | undefined) => `dtf-inv-carts-${userId ?? 'anon'}`

function load(key: string): Carts {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}') as Partial<Carts>
    return { ...EMPTY, ...parsed }
  } catch {
    return EMPTY
  }
}

// Keranjang disimpan per akun di browser, jadi tidak hilang saat refresh.
export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const key = storageKey(user?.id)
  const [state, setState] = useState<{ key: string; carts: Carts }>(() => ({ key, carts: load(key) }))

  if (state.key !== key) setState({ key, carts: load(key) })

  useEffect(() => {
    try {
      localStorage.setItem(state.key, JSON.stringify(state.carts))
    } catch {
      // penyimpanan diblokir: keranjang hanya hidup selama halaman terbuka
    }
  }, [state])

  const update = useCallback((fn: (c: Carts) => Carts) => setState((s) => ({ ...s, carts: fn(s.carts) })), [])

  const api = useMemo<CartApi>(
    () => ({
      qty: (kind, id) => state.carts[kind][id] ?? 0,
      count: (kind) => Object.keys(state.carts[kind]).length,
      lines: (kind) => Object.entries(state.carts[kind]).map(([id, qty]) => ({ item_id: Number(id), qty })),
      set: (kind, id, qty) =>
        update((c) => {
          const next = { ...c[kind] }
          if (qty > 0) next[id] = Math.floor(qty)
          else delete next[id]
          return { ...c, [kind]: next }
        }),
      remove: (kind, id) =>
        update((c) => {
          const next = { ...c[kind] }
          delete next[id]
          return { ...c, [kind]: next }
        }),
      clear: (kind) => update((c) => ({ ...c, [kind]: {} })),
    }),
    [state.carts, update],
  )

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart di luar CartProvider')
  return ctx
}
