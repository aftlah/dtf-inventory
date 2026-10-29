import { Router } from 'express'
import { query } from '../db.js'
import { HttpError, wrap } from '../util.js'

/* ---------- Log aktivitas (admin/staff) ---------- */

export const auditRouter = Router()

const ENTITIES = ['item', 'location', 'user', 'order', 'request', 'cash']

auditRouter.get(
  '/',
  wrap(async (req, res) => {
    const where = []
    const params = []
    if (ENTITIES.includes(req.query.entity)) {
      where.push('entity = ?')
      params.push(req.query.entity)
    }
    const q = String(req.query.q ?? '').trim()
    if (q) {
      where.push('(entity_label LIKE ? OR actor_name LIKE ? OR action LIKE ?)')
      const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
      params.push(like, like, like)
    }
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const rows = await query(
      `SELECT id, created_at, actor_name, entity, entity_id, entity_label, action, changes
         FROM audit_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, limit + 1, offset],
    )
    // JSON dikembalikan sebagai objek (MySQL) atau string (MariaDB): samakan.
    const parse = (v) => {
      if (typeof v !== 'string') return v ?? null
      try {
        return JSON.parse(v)
      } catch {
        return null
      }
    }
    res.json({
      rows: rows.slice(0, limit).map((r) => ({ ...r, changes: parse(r.changes) })),
      hasMore: rows.length > limit,
    })
  }),
)

/* ---------- Notifikasi (semua akun, hanya milik sendiri) ---------- */

export const notificationsRouter = Router()

notificationsRouter.get(
  '/',
  wrap(async (req, res) => {
    const rows = await query(
      `SELECT id, kind, title, body, link, read_at, created_at
         FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30`,
      [req.user.id],
    )
    const [{ unread }] = await query(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL',
      [req.user.id],
    )
    // Bersihkan notifikasi yang sudah dibaca lebih dari 30 hari.
    void query('DELETE FROM notifications WHERE user_id = ? AND read_at < (UTC_TIMESTAMP() - INTERVAL 30 DAY)', [
      req.user.id,
    ]).catch(() => {})
    res.json({ unread: Number(unread), rows })
  }),
)

notificationsRouter.post(
  '/read',
  wrap(async (req, res) => {
    if (req.body?.all === true) {
      await query('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL', [
        req.user.id,
      ])
    } else if (Array.isArray(req.body?.ids) && req.body.ids.length) {
      const ids = req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      if (!ids.length) throw new HttpError(400, 'ID tidak valid')
      await query(
        'UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND id IN (?) AND read_at IS NULL',
        [req.user.id, ids],
      )
    } else {
      throw new HttpError(400, 'Tentukan ids atau all')
    }
    res.json({ ok: true })
  }),
)

/* ---------- Laporan keuangan (admin/staff) ---------- */

export const financeRouter = Router()

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const WIB = '+07:00'
// Hari mengikuti WIB, jadi batas tanggal diubah ke UTC (sesi database memakai UTC, lihat db.js).
const dayOf = (col) => `DATE_FORMAT(CONVERT_TZ(${col}, '+00:00', '${WIB}'), '%Y-%m-%d')`

function wibRange(req) {
  const parse = (v, name) => {
    if (!v) return null
    if (!DATE_RE.test(String(v)) || Number.isNaN(Date.parse(String(v)))) throw new HttpError(400, `${name} tidak valid`)
    return String(v)
  }
  const from = parse(req.query.from, 'Tanggal awal')
  const to = parse(req.query.to, 'Tanggal akhir')
  return {
    from: from ? new Date(`${from}T00:00:00${WIB}`) : null,
    // batas atas eksklusif: awal hari berikutnya
    to: to ? new Date(new Date(`${to}T00:00:00${WIB}`).getTime() + 24 * 3600 * 1000) : null,
  }
}

function between(col, { from, to }) {
  const sql = []
  const params = []
  if (from) {
    sql.push(`${col} >= ?`)
    params.push(from)
  }
  if (to) {
    sql.push(`${col} < ?`)
    params.push(to)
  }
  return { sql: sql.length ? ` AND ${sql.join(' AND ')}` : '', params }
}

// Definisi:
//   Penjualan = pesanan Market yang DISETUJUI + uang hasil Penjualan yang DILAPORKAN
//   Modal     = harga modal (disalin saat transaksi) x qty barang yang terjual
//   Profit    = Penjualan - Modal
//   Dibayar ke member = total Jual Barang yang selesai (pengeluaran toko; tidak mengurangi profit di atas)
// Pemrosesan tidak dihitung ke profit. Pesanan diakui saat disetujui, Penjualan saat dilaporkan.
financeRouter.get(
  '/report',
  wrap(async (req, res) => {
    const range = wibRange(req)
    const o = between('o.decided_at', range)
    const s = between('r.reported_at', range)
    const b = between('r.completed_at', range)

    const orderDays = await query(
      `SELECT ${dayOf('o.decided_at')} AS day, COUNT(DISTINCT o.id) AS n,
              SUM(oi.unit_price * oi.qty) AS revenue, SUM(oi.cost * oi.qty) AS cogs
         FROM orders o JOIN order_items oi ON oi.order_id = o.id
        WHERE o.status = 'approved'${o.sql}
        GROUP BY day`,
      o.params,
    )
    const saleDays = await query(
      `SELECT day, COUNT(*) AS n, SUM(money) AS revenue, SUM(cogs) AS cogs FROM (
         SELECT ${dayOf('r.reported_at')} AS day, COALESCE(r.result_money, 0) AS money,
                COALESCE((SELECT SUM(ri.cost * ri.qty) FROM request_items ri
                           WHERE ri.request_id = r.id AND ri.role = 'input'), 0) AS cogs
           FROM requests r
          WHERE r.kind = 'sale' AND r.status IN ('reported', 'completed')${s.sql}
       ) t GROUP BY day`,
      s.params,
    )
    const [{ paid }] = await query(
      `SELECT COALESCE(SUM(r.total), 0) AS paid FROM requests r
        WHERE r.kind = 'buyback' AND r.status = 'completed'${b.sql}`,
      b.params,
    )
    const [{ stockValue }] = await query(
      `SELECT COALESCE(SUM(x.q * i.cost_price), 0) AS stockValue
         FROM (SELECT s.item_id, SUM(s.qty) AS q FROM stock_levels s
                 JOIN locations l ON l.id = s.location_id AND l.deleted_at IS NULL
                GROUP BY s.item_id) x
         JOIN items i ON i.id = x.item_id AND i.deleted_at IS NULL`,
    )
    const [{ noCost }] = await query(
      `SELECT COUNT(*) AS noCost FROM items
        WHERE deleted_at IS NULL AND cost_price = 0 AND (in_market = 1 OR in_sale = 1)`,
    )
    const topItems = await query(
      `SELECT oi.item_name AS name, SUM(oi.qty) AS qty, SUM(oi.unit_price * oi.qty) AS revenue,
              SUM((CAST(oi.unit_price AS SIGNED) - CAST(oi.cost AS SIGNED)) * CAST(oi.qty AS SIGNED)) AS profit
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status = 'approved'${o.sql}
        GROUP BY oi.item_name ORDER BY profit DESC LIMIT 10`,
      o.params,
    )

    const num = (v) => Number(v ?? 0)
    const days = new Map()
    for (const r of [...orderDays, ...saleDays]) {
      const d = days.get(r.day) ?? { day: r.day, revenue: 0, cogs: 0 }
      d.revenue += num(r.revenue)
      d.cogs += num(r.cogs)
      days.set(r.day, d)
    }
    const byDay = [...days.values()]
      .sort((a, c) => a.day.localeCompare(c.day))
      .map((d) => ({ ...d, profit: d.revenue - d.cogs }))

    const sum = (rows, k) => rows.reduce((t, r) => t + num(r[k]), 0)
    res.json({
      orders_count: sum(orderDays, 'n'),
      orders_revenue: sum(orderDays, 'revenue'),
      orders_cogs: sum(orderDays, 'cogs'),
      sales_count: sum(saleDays, 'n'),
      sales_revenue: sum(saleDays, 'revenue'),
      sales_cogs: sum(saleDays, 'cogs'),
      buyback_paid: num(paid),
      stock_value: num(stockValue),
      items_no_cost: num(noCost),
      by_day: byDay,
      top_items: topItems.map((r) => ({
        name: r.name,
        qty: num(r.qty),
        revenue: num(r.revenue),
        profit: num(r.profit),
      })),
    })
  }),
)

/* ---------- Dashboard pribadi (semua akun; dipakai member) ---------- */

export const meRouter = Router()

// Senin 00:00 sampai Senin berikutnya, menurut WIB, dinyatakan dalam UTC.
function weekRangeWib() {
  const wib = new Date(Date.now() + 7 * 3600 * 1000) // jam dinding WIB dibaca lewat getUTC*
  const sinceMonday = (wib.getUTCDay() + 6) % 7
  const start = new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate() - sinceMonday) - 7 * 3600 * 1000)
  return { start, end: new Date(start.getTime() + 7 * 24 * 3600 * 1000) }
}

meRouter.get(
  '/dashboard',
  wrap(async (req, res) => {
    const uid = req.user.id
    const week = weekRangeWib()

    const [counts] = await query(
      `SELECT
         (SELECT COUNT(*) FROM orders WHERE user_id = ? AND (status = 'pending' OR (status = 'approved' AND (paid = 0
            OR EXISTS (SELECT 1 FROM order_items h WHERE h.order_id = orders.id AND h.handed_at IS NULL))))) AS orders_pending,
         (SELECT COUNT(*) FROM orders WHERE user_id = ? AND status IN ('pending','approved') AND paid = 0) AS unpaid_count,
         (SELECT COALESCE(SUM(total), 0) FROM orders WHERE user_id = ? AND status IN ('pending','approved') AND paid = 0) AS unpaid_total,
         (SELECT COUNT(*) FROM requests WHERE user_id = ? AND status = 'approved') AS need_report,
         (SELECT COUNT(*) FROM requests WHERE user_id = ? AND status IN ('pending','reported')) AS requests_waiting,
         (SELECT COALESCE(SUM(total), 0) FROM orders
           WHERE user_id = ? AND status = 'approved' AND decided_at >= ? AND decided_at < ?) AS spent_week`,
      [uid, uid, uid, uid, uid, uid, week.start, week.end],
    )

    const unpaidOrders = await query(
      `SELECT id, total, status, created_at FROM orders
        WHERE user_id = ? AND status IN ('pending','approved') AND paid = 0 ORDER BY id DESC LIMIT 5`,
      [uid],
    )
    const needReport = await query(
      `SELECT id, kind, created_at FROM requests WHERE user_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 5`,
      [uid],
    )
    const recentOrders = await query(
      `SELECT id, status, total, paid, created_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 6`,
      [uid],
    )
    const recentRequests = await query(
      `SELECT id, kind, status, total, result_money, created_at FROM requests WHERE user_id = ? ORDER BY id DESC LIMIT 6`,
      [uid],
    )

    // Leaderboard minggu ini (Senin–Minggu, WIB), terlihat oleh semua member.
    const spenders = await query(
      `SELECT user_id, MAX(user_name) AS name, COUNT(*) AS count, SUM(total) AS amount
         FROM orders WHERE status = 'approved' AND decided_at >= ? AND decided_at < ?
        GROUP BY user_id ORDER BY amount DESC LIMIT 10`,
      [week.start, week.end],
    )
    const sellers = await query(
      `SELECT user_id, MAX(user_name) AS name, COUNT(*) AS count, SUM(amount) AS amount FROM (
         SELECT user_id, user_name, COALESCE(result_money, 0) AS amount FROM requests
          WHERE kind = 'sale' AND status IN ('reported','completed') AND reported_at >= ? AND reported_at < ?
         UNION ALL
         SELECT user_id, user_name, total AS amount FROM requests
          WHERE kind = 'buyback' AND status = 'completed' AND completed_at >= ? AND completed_at < ?
       ) t GROUP BY user_id ORDER BY amount DESC LIMIT 10`,
      [week.start, week.end, week.start, week.end],
    )
    const board = (rows) =>
      rows.map((r) => ({ user_id: r.user_id, name: r.name, count: Number(r.count), amount: Number(r.amount) }))

    res.json({
      counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Number(v)])),
      unpaid_orders: unpaidOrders.map((o) => ({ ...o, total: Number(o.total) })),
      need_report: needReport,
      recent_orders: recentOrders.map((o) => ({ ...o, total: Number(o.total), paid: !!o.paid })),
      recent_requests: recentRequests.map((r) => ({
        ...r,
        total: Number(r.total),
        result_money: r.result_money === null ? null : Number(r.result_money),
      })),
      leaderboard: {
        week_start: week.start,
        week_end: new Date(week.end.getTime() - 1),
        spenders: board(spenders),
        sellers: board(sellers),
      },
    })
  }),
)
