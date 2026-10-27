import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'

type Cart = Record<number, number>

type CartApi = {
  qty: (itemId: number) => number
  count: number
  lines: { item_id: number; qty: number }[]
  set: (itemId: number, qty: number) => void
  remove: (itemId: number) => void
  clear: () => void
}

const CartContext = createContext<CartApi | null>(null)

const storageKey = (userId: number | undefined) => `dtf-inv-cart-${userId ?? 'anon'}`

function load(key: string): Cart {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}') as Cart
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// Keranjang disimpan per akun di browser, jadi tidak hilang saat refresh.
export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const key = storageKey(user?.id)
  const [state, setState] = useState<{ key: string; cart: Cart }>(() => ({ key, cart: load(key) }))

  if (state.key !== key) setState({ key, cart: load(key) })

  useEffect(() => {
    try {
      localStorage.setItem(state.key, JSON.stringify(state.cart))
    } catch {
      // penyimpanan diblokir: keranjang hanya hidup selama halaman terbuka
    }
  }, [state])

  const update = useCallback((fn: (c: Cart) => Cart) => setState((s) => ({ ...s, cart: fn(s.cart) })), [])

  const api = useMemo<CartApi>(
    () => ({
      qty: (id) => state.cart[id] ?? 0,
      count: Object.keys(state.cart).length,
      lines: Object.entries(state.cart).map(([id, qty]) => ({ item_id: Number(id), qty })),
      set: (id, qty) =>
        update((c) => {
          const next = { ...c }
          if (qty > 0) next[id] = Math.floor(qty)
          else delete next[id]
          return next
        }),
      remove: (id) =>
        update((c) => {
          const next = { ...c }
          delete next[id]
          return next
        }),
      clear: () => update(() => ({})),
    }),
    [state.cart, update],
  )

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart di luar CartProvider')
  return ctx
}
