export type Role = 'admin' | 'staff' | 'member'

export type User = { id: number; name: string; username: string; role: Role }
export type UserRow = User & { active: number; created_at: string }

export type Item = {
  id: number
  name: string
  category: string | null
  unit: string
  min_stock: number
  notes: string | null
  price: number
  image_url: string | null
  in_market: boolean
}

export type Location = {
  id: number
  name: string
  kind: string
  notes: string | null
  sell_in_market: boolean
}

export type StockRow = { item_id: number; location_id: number; qty: number }

export type LogType = 'in' | 'out' | 'transfer_in' | 'transfer_out'

export type LogRow = {
  id: number
  item_id: number
  item_name: string
  unit: string
  location_id: number
  location_name: string
  type: LogType
  qty: number
  note: string | null
  user_name: string
  transfer_id: string | null
  created_at: string
}

export type Dashboard = {
  counts: { items: number; locations: number; units: number; in_today: number; out_today: number; pending_orders: number }
  lowStock: { id: number; name: string; unit: string; min_stock: number; qty: number }[]
  recent: Omit<LogRow, 'item_id' | 'location_id' | 'note' | 'transfer_id'>[]
}

export type MarketItem = {
  id: number
  name: string
  category: string | null
  unit: string
  price: number
  image_url: string | null
  available: number
}

export type OrderStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type Order = {
  id: number
  user_id: number
  user_name: string
  status: OrderStatus
  total: number
  note: string | null
  created_at: string
  decided_by_name: string | null
  decided_at: string | null
  cancelled_by_name: string | null
  cancelled_at: string | null
  paid: boolean
  paid_at: string | null
  paid_by_name: string | null
  lines: { item_id: number; item_name: string; image_url: string | null; qty: number; unit_price: number }[]
  allocations: { item_id: number; qty: number; location_name: string }[]
}
