export type Role = 'admin' | 'staff'

export type User = { id: number; name: string; username: string; role: Role }
export type UserRow = User & { active: number; created_at: string }

export type Item = {
  id: number
  name: string
  category: string | null
  unit: string
  min_stock: number
  notes: string | null
}

export type Location = { id: number; name: string; kind: string; notes: string | null }

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
  counts: { items: number; locations: number; units: number; in_today: number; out_today: number }
  lowStock: { id: number; name: string; unit: string; min_stock: number; qty: number }[]
  recent: Omit<LogRow, 'item_id' | 'location_id' | 'note' | 'transfer_id'>[]
}
