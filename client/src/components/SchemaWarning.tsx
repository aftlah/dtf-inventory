import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { api } from '@/lib/api'

/**
 * Khusus admin: bila database belum sesuai versi aplikasi (biasanya kode sudah diunggah tetapi `host:db-init`
 * belum dijalankan atau gagal), tampilkan peringatan jelas beserta solusinya. Diam bila semuanya sesuai.
 */
export function SchemaWarning() {
  const [problems, setProblems] = useState<string[]>([])

  useEffect(() => {
    let alive = true
    const check = () =>
      api<{ ok: boolean; problems: string[] }>('/system/schema')
        .then((r) => alive && setProblems(r.problems))
        .catch(() => {}) // pemeriksaan ini sendiri tidak boleh mengganggu halaman
    void check()
    const t = setInterval(check, 5 * 60 * 1000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  if (problems.length === 0) return null
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden />
      <div className="space-y-1.5">
        <p className="font-semibold">Database belum sesuai versi aplikasi</p>
        <ul className="list-disc pl-5 text-amber-100/90">
          {problems.slice(0, 6).map((p) => (
            <li key={p}>{p}</li>
          ))}
          {problems.length > 6 ? <li>… dan {problems.length - 6} lainnya</li> : null}
        </ul>
        <p>
          Solusi: di hosting buka <span className="font-semibold">Setup Node.js App → Run JS script → host:db-init</span>, tunggu
          sampai muncul "Skema siap", lalu klik <span className="font-semibold">RESTART</span>. Sebelum itu, sebagian halaman
          akan menampilkan error.
        </p>
      </div>
    </div>
  )
}
