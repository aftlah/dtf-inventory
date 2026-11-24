import { Router } from 'express'
import { query, withTx } from '../db.js'
import { audit } from '../audit.js'
import { requireStaff } from '../auth.js'
import { HttpError, str, wrap } from '../util.js'

// Absensi harian. Semua akun mengisi absennya sendiri (hadir hari ini, atau izin untuk hari ini/ke depan);
// melihat siapa saja yang masuk kota di tanggal tertentu dan mengoreksi catatan hanya untuk admin/staff.
// Tanggal selalu menurut WIB (UTC+7) dan dipertukarkan sebagai teks 'YYYY-MM-DD'.
export const attendanceRouter = Router()

const STATUSES = ['present', 'excused']
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 3600 * 1000
const WINDOW_DAYS = 30 // jangka waktu ringkasan di dashboard
const MAX_AHEAD_DAYS = 14 // izin boleh diajukan sampai sekian hari ke depan

const wibDay = (ms = Date.now()) => new Date(ms + 7 * 3600 * 1000).toISOString().slice(0, 10)
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

function parseDay(value, field = 'Tanggal') {
  const s = String(value ?? '')
  // Dua pemeriksaan: bentuknya benar, dan tanggalnya ada (mis. 2026-02-31 tidak lolos).
  if (!DAY_RE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`)) || addDays(s, 0) !== s)
    throw new HttpError(400, `${field} tidak valid`)
  return s
}

function parseStatus(body) {
  const status = body?.status
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Pilih Hadir atau Izin')
  const note = str(body?.note, { field: 'Keterangan', max: 500 })
  if (status === 'excused' && !note) throw new HttpError(400, 'Keterangan wajib diisi untuk izin')
  return { status, note: status === 'excused' ? note : null }
}

// Hari pertama absensi dipakai = tanggal (WIB) catatan paling awal di sistem. Hari sebelum itu tidak dihitung "tidak hadir"
// (fitur belum ada), jadi akun lama tidak langsung terlihat bolos puluhan hari. Belum ada catatan sama sekali = hari ini.
async function firstUseDay(today) {
  const [row] = await query(
    `SELECT MIN(DATE_FORMAT(CONVERT_TZ(checked_at, '+00:00', '+07:00'), '%Y-%m-%d')) AS d FROM attendance_daily`,
  )
  return row?.d ?? today
}

const UPSERT = `INSERT INTO attendance_daily (user_id, day, status, note, marked_by_name, marked_by_staff)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  checked_at = IF(status <> VALUES(status), NOW(), checked_at),
                  status = VALUES(status), note = VALUES(note),
                  marked_by_name = VALUES(marked_by_name), marked_by_staff = VALUES(marked_by_staff)`

/* ---------- Absen sendiri ---------- */

// day kosong = hari ini. Hadir hanya untuk hari ini; izin untuk hari ini sampai MAX_AHEAD_DAYS ke depan.
attendanceRouter.post(
  '/check-in',
  wrap(async (req, res) => {
    const { status, note } = parseStatus(req.body)
    const today = wibDay()
    const day = req.body?.day ? parseDay(req.body.day) : today
    if (status === 'present' && day !== today) throw new HttpError(409, 'Absen hadir hanya bisa untuk hari ini.')
    if (day < today)
      throw new HttpError(409, 'Hari yang sudah lewat tidak bisa diubah sendiri. Hubungi staff bila perlu dikoreksi.')
    if (day > addDays(today, MAX_AHEAD_DAYS))
      throw new HttpError(400, `Izin hanya bisa diajukan maksimal ${MAX_AHEAD_DAYS} hari ke depan.`)
    await withTx(async (conn) => {
      const [[existing]] = await conn.query(
        'SELECT marked_by_staff FROM attendance_daily WHERE user_id = ? AND day = ? FOR UPDATE',
        [req.user.id, day],
      )
      if (existing?.marked_by_staff)
        throw new HttpError(409, 'Kehadiranmu di hari itu sudah dicatat staff dan tidak bisa diubah sendiri.')
      await conn.query(UPSERT, [req.user.id, day, status, note, req.user.name, 0])
    })
    res.json({ ok: true })
  }),
)

// Status hari ini, ringkasan 30 hari terakhir, dan riwayat harian akun yang login.
// "Tidak hadir" = hari yang sudah lewat tanpa catatan (sejak akun dibuat). Izin tidak dihitung sebagai tidak hadir:
// persentase = hadir / (hadir + tidak hadir).
attendanceRouter.get(
  '/me',
  wrap(async (req, res) => {
    const uid = req.user.id
    const today = wibDay()
    const from = addDays(today, -(WINDOW_DAYS - 1))
    const [u] = await query('SELECT created_at FROM users WHERE id = ?', [uid])
    // Hari dihitung sejak akun dibuat DAN sejak absensi mulai dipakai (mana yang lebih akhir).
    const createdDay = wibDay(new Date(u.created_at).getTime())
    const first = await firstUseDay(today)
    const countFrom = createdDay > first ? createdDay : first

    const rows = await query(
      `SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, status, note, marked_by_staff, checked_at
         FROM attendance_daily WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY day DESC`,
      [uid, from, addDays(today, MAX_AHEAD_DAYS)],
    )
    const byDay = new Map(rows.map((r) => [r.day, r]))
    const mine = (r) => (r ? { status: r.status, note: r.note, by_staff: !!r.marked_by_staff, at: r.checked_at } : null)

    let present = 0
    let excused = 0
    let absent = 0
    const days = []
    for (let i = 0; i < WINDOW_DAYS; i++) {
      const day = addDays(today, -i)
      const r = byDay.get(day)
      let status = r?.status ?? null
      if (!r && day < today && day >= countFrom) status = 'absent' // hari lewat tanpa catatan
      if (status === 'present') present++
      else if (status === 'excused') excused++
      else if (status === 'absent') absent++
      days.push({ day, status, note: r?.note ?? null, by_staff: !!r?.marked_by_staff, at: r?.checked_at ?? null })
    }
    const counted = present + absent
    res.json({
      today: { day: today, mine: mine(byDay.get(today)) },
      summary: { present, excused, absent, total: present + excused + absent, percent: counted ? Math.round((present / counted) * 100) : null, window_days: WINDOW_DAYS },
      days,
      upcoming: rows.filter((r) => r.day > today).map((r) => ({ day: r.day, note: r.note, by_staff: !!r.marked_by_staff })).reverse(),
    })
  }),
)

/* ---------- Staff: siapa yang masuk kota ---------- */

// Ringkasan per hari (hari ini ke belakang), untuk memilih tanggal dan melihat tren.
attendanceRouter.get(
  '/days',
  requireStaff,
  wrap(async (req, res) => {
    const limit = Math.min(Math.max(Math.floor(Number(req.query.limit)) || 14, 1), 60)
    const today = wibDay()
    const from = addDays(today, -(limit - 1))
    const rows = await query(
      `SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, COALESCE(SUM(status = 'present'), 0) AS present,
              COALESCE(SUM(status = 'excused'), 0) AS excused
         FROM attendance_daily WHERE day BETWEEN ? AND ? GROUP BY day`,
      [from, today],
    )
    const byDay = new Map(rows.map((r) => [r.day, r]))
    const [{ total }] = await query('SELECT COUNT(*) AS total FROM users WHERE active = 1')
    res.json({
      today,
      roster_size: Number(total),
      days: Array.from({ length: limit }, (_, i) => {
        const day = addDays(today, -i)
        const r = byDay.get(day)
        return { day, present: Number(r?.present ?? 0), excused: Number(r?.excused ?? 0) }
      }),
    })
  }),
)

// Semua akun pada satu tanggal dengan statusnya. Akun yang dibuat setelah tanggal itu tidak ikut (kecuali punya catatan).
attendanceRouter.get(
  '/day/:day',
  requireStaff,
  wrap(async (req, res) => {
    const day = parseDay(req.params.day)
    const today = wibDay()
    const people = await query(
      `SELECT u.id AS user_id, u.name, u.username, u.role, d.status, d.note, d.marked_by_name, d.marked_by_staff, d.checked_at
         FROM users u
         LEFT JOIN attendance_daily d ON d.user_id = u.id AND d.day = ?
        WHERE (u.active = 1 AND DATE(CONVERT_TZ(u.created_at, '+00:00', '+07:00')) <= ?) OR d.id IS NOT NULL
        ORDER BY u.name`,
      [day, day],
    )
    const present = people.filter((p) => p.status === 'present').length
    const excused = people.filter((p) => p.status === 'excused').length
    res.json({
      day,
      today,
      state: day < today ? 'past' : day === today ? 'today' : 'future',
      // false = hari sebelum absensi mulai dipakai: akun tanpa catatan tidak dianggap tidak hadir.
      tracked: day >= (await firstUseDay(today)),
      counts: { present, excused, none: people.length - present - excused },
      people: people.map((p) => ({ ...p, marked_by_staff: !!p.marked_by_staff })),
    })
  }),
)

// Staff mencatat/mengoreksi kehadiran seseorang di tanggal tertentu. status 'none' = hapus catatan.
attendanceRouter.put(
  '/day/:day/users/:userId',
  requireStaff,
  wrap(async (req, res) => {
    const day = parseDay(req.params.day)
    const clear = req.body?.status === 'none'
    const parsed = clear ? null : parseStatus(req.body)
    if (parsed?.status === 'present' && day > wibDay()) throw new HttpError(409, 'Hadir tidak bisa dicatat untuk hari yang belum tiba.')
    await withTx(async (conn) => {
      const [[user]] = await conn.query('SELECT id, name FROM users WHERE id = ?', [req.params.userId])
      if (!user) throw new HttpError(404, 'Pengguna tidak ditemukan')
      const label = `${day} · ${user.name}`
      if (clear) {
        const [r] = await conn.query('DELETE FROM attendance_daily WHERE user_id = ? AND day = ?', [user.id, day])
        if (r.affectedRows)
          await audit(req.user, { entity: 'attendance', id: user.id, label, action: 'clear', details: { dicatat_untuk: user.name } }, conn)
        return
      }
      await conn.query(UPSERT, [user.id, day, parsed.status, parsed.note, req.user.name, 1])
      await audit(
        req.user,
        {
          entity: 'attendance',
          id: user.id,
          label,
          action: 'mark',
          details: { dicatat_untuk: user.name, status: parsed.status === 'present' ? 'Hadir' : 'Izin', ...(parsed.note ? { keterangan: parsed.note } : {}) },
        },
        conn,
      )
    })
    res.json({ ok: true })
  }),
)
