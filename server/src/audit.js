import { pool } from './db.js'

// Bandingkan nilai tanpa peduli beda tipe (5 vs "5", true vs 1).
const norm = (v) => (v === true ? '1' : v === false ? '0' : v === null || v === undefined ? '' : String(v))

/**
 * Catat aktivitas ke audit_log.
 * - before + after: yang dicatat hanya kolom yang berubah, { field: [lama, baru] }. Tanpa perubahan = tidak dicatat.
 * - hanya after: catatan pembuatan (nilai awal). Hanya before: catatan penghapusan (snapshot).
 * - details: info tambahan bebas (mis. { alasan: '...' }).
 * `db` boleh pool (bawaan) atau koneksi transaksi, supaya log ikut ter-rollback bila transaksi gagal.
 */
export async function audit(user, { entity, id = null, label = null, action, before, after, details }, db = pool) {
  let changes = null
  if (before && after) {
    const diff = {}
    for (const key of Object.keys(after)) {
      if (norm(before[key]) !== norm(after[key])) diff[key] = [before[key] ?? null, after[key] ?? null]
    }
    if (Object.keys(diff).length === 0 && !details) return
    changes = diff
  } else if (after) {
    changes = after
  } else if (before) {
    changes = before
  }
  if (details) changes = { ...(changes ?? {}), ...details }

  await db.query(
    `INSERT INTO audit_log (actor_id, actor_name, entity, entity_id, entity_label, action, changes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      user?.id ?? null,
      user?.name ?? 'Sistem',
      entity,
      id,
      label ? String(label).slice(0, 150) : null,
      action,
      changes ? JSON.stringify(changes) : null,
    ],
  )
}
