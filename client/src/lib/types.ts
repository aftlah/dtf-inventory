export type Role = 'admin' | 'staff' | 'member' | 'highrank' | 'holly' | 'hangaround'

export type AccountRequest = { id: number; name: string; username: string; created_at: string }

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
  in_sale: boolean
  in_process: boolean
  min_sale_qty: number
  in_buyback: boolean
  buyback_price: number
  cost_price: number
  /** Batas beli per pesanan Market untuk role member / highrank. Null = tanpa batas. */
  max_buy_member: number | null
  max_buy_highrank: number | null
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
  counts: { items: number; locations: number; units: number; in_today: number; out_today: number; pending_orders: number; open_requests: number }
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
  /** Batas beli per pesanan untuk akun yang sedang login. Null = tanpa batas. */
  max_buy: number | null
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
  lines: {
    item_id: number
    item_name: string
    image_url: string | null
    qty: number
    unit_price: number
    /** Kapan barang diserahkan ke pembeli (dicentang petugas brangkas); null = belum. */
    handed_at: string | null
    handed_by_name: string | null
  }[]
  allocations: { item_id: number; qty: number; location_name: string }[]
}

export type RequestKind = 'sale' | 'process' | 'buyback'
export type RequestStatus = 'pending' | 'approved' | 'reported' | 'completed' | 'rejected' | 'cancelled'

export type RequestRow = {
  id: number
  kind: RequestKind
  user_id: number
  user_name: string
  status: RequestStatus
  result_money: number | null
  total: number
  proof_url: string | null
  review_note: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  reported_at: string | null
  completed_at: string | null
  confirmed_by_name: string | null
  created_at: string
  items: {
    role: 'input' | 'result'
    item_id: number
    item_name: string
    image_url: string | null
    qty: number
    price: number
  }[]
}

export type RequestOptions = {
  items: {
    id: number
    name: string
    category: string | null
    unit: string
    image_url: string | null
    min_qty: number
    price: number
    available: number
  }[]
  resultItems: { id: number; name: string; category: string | null; unit: string; image_url: string | null }[]
}

export type CashType = 'income' | 'expense'
export type WashStatus = 'dirty' | 'washing' | 'clean'

export type CashEntry = {
  id: number
  entry_date: string
  type: CashType
  category: string
  amount: number
  counterparty: string | null
  note: string | null
  wash_status: WashStatus | null
  ref_type: string | null
  ref_id: number | null
  created_by_name: string
}

export type CashSummary = {
  income: number
  expense: number
  balance: number
  pools: Record<WashStatus, number>
  expense_by_category: { category: string; amount: number; count: number }[]
  income_by_category: { category: string; amount: number; count: number }[]
}

export type NotificationRow = {
  id: number
  kind: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export type AuditRow = {
  id: number
  created_at: string
  actor_name: string
  entity: string
  entity_id: number | null
  entity_label: string | null
  action: string
  changes: Record<string, unknown> | null
}

export type FinanceReport = {
  orders_count: number
  orders_revenue: number
  orders_cogs: number
  sales_count: number
  sales_revenue: number
  sales_cogs: number
  buyback_paid: number
  stock_value: number
  items_no_cost: number
  by_day: { day: string; revenue: number; cogs: number; profit: number }[]
  top_items: { name: string; qty: number; revenue: number; profit: number }[]
}

export type LeaderRow = { user_id: number; name: string; count: number; amount: number }

export type MemberDashboard = {
  counts: {
    orders_pending: number
    unpaid_count: number
    unpaid_total: number
    need_report: number
    requests_waiting: number
    spent_week: number
  }
  unpaid_orders: { id: number; total: number; status: OrderStatus; created_at: string }[]
  need_report: { id: number; kind: RequestKind; created_at: string }[]
  recent_orders: { id: number; status: OrderStatus; total: number; paid: boolean; created_at: string }[]
  recent_requests: {
    id: number
    kind: RequestKind
    status: RequestStatus
    total: number
    result_money: number | null
    created_at: string
  }[]
  leaderboard: { week_start: string; week_end: string; spenders: LeaderRow[]; sellers: LeaderRow[] }
}

/* ---------- Absensi harian ---------- */

export type AttendanceStatus = 'present' | 'excused'
/** Catatan kehadiran seseorang pada satu hari. */
export type AttendanceMine = { id: number; status: AttendanceStatus; note: string | null; by_staff: boolean; at: string; has_photo: boolean }
/** Status satu hari: 'absent' = hari lewat tanpa catatan; null = belum ada (hari ini/ke depan, atau sebelum akun dibuat). */
export type AttendanceDayStatus = AttendanceStatus | 'absent' | null

export type MyAttendance = {
  today: { day: string; mine: AttendanceMine | null }
  summary: { present: number; excused: number; absent: number; total: number; percent: number | null; window_days: number }
  days: { day: string; id: number | null; status: AttendanceDayStatus; note: string | null; by_staff: boolean; at: string | null; has_photo: boolean }[]
  upcoming: { day: string; note: string | null; by_staff: boolean }[]
}

/** Staff: ringkasan jumlah per hari (hari ini ke belakang). */
export type AttendanceDays = {
  today: string
  roster_size: number
  /** Foto absen disimpan sekian hari, lalu dihapus otomatis. */
  photo_days: number
  days: { day: string; present: number; excused: number }[]
}

export type AttendancePerson = {
  user_id: number
  name: string
  username: string
  role: Role
  /** Id catatan (untuk mengambil foto); null = belum ada catatan. */
  record_id: number | null
  has_photo: boolean
  status: AttendanceStatus | null
  note: string | null
  marked_by_name: string | null
  marked_by_staff: boolean
  checked_at: string | null
}

/** Staff: semua akun pada satu tanggal. */
export type AttendanceDay = {
  day: string
  today: string
  state: 'past' | 'today' | 'future'
  /** false = hari sebelum absensi mulai dipakai; akun tanpa catatan tidak dianggap tidak hadir. */
  tracked: boolean
  counts: { present: number; excused: number; none: number }
  people: AttendancePerson[]
}
