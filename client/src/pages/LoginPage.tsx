import { useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, Clock, Loader2, LogIn, UserPlus } from 'lucide-react'
import { brand } from '@/brand'
import { Field } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError, api } from '@/lib/api'

type Mode = 'login' | 'request' | 'sent'

export function LoginPage() {
  const { signIn } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState('')
  const [website, setWebsite] = useState('') // kolom jebakan untuk bot; manusia tidak melihatnya
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // 403 saat login = akun ada tapi belum bisa dipakai (menunggu persetujuan atau ditolak): tampil sebagai pemberitahuan.
  const [notice, setNotice] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(false)
    setPassword('')
    setConfirm('')
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(false)
    try {
      await signIn(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk')
      setNotice(err instanceof ApiError && err.status === 403)
    } finally {
      setBusy(false)
    }
  }

  async function onRequest(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('Konfirmasi password tidak sama')
      return
    }
    setBusy(true)
    try {
      await api('/auth/request-account', { method: 'POST', body: { name, username, password, website } })
      setMode('sent')
      setPassword('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim permintaan')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-shell flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-2xl shadow-black/40">
        <CardContent className="py-2">
          <div className="mb-6 text-center">
            {brand.logo ? (
              <img src={brand.logo} alt={brand.name} className="mx-auto w-44" />
            ) : (
              <p className="text-4xl font-extrabold tracking-tight text-primary">{brand.name}</p>
            )}
            <p className="mt-1 text-[10px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
              {brand.subtitle}
            </p>
          </div>

          {mode === 'login' ? (
            <>
              <form onSubmit={onLogin} className="flex flex-col gap-4">
                <Field label="Username">
                  <Input
                    autoFocus
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Password">
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
                {error ? (
                  <p
                    role="alert"
                    className={
                      notice && !error.includes('ditolak')
                        ? 'flex items-start gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-200'
                        : 'rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive'
                    }
                  >
                    {notice && !error.includes('ditolak') ? <Clock className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
                    {error}
                  </p>
                ) : null}
                <Button type="submit" disabled={busy} className="h-10">
                  {busy ? <Loader2 className="animate-spin" /> : <LogIn />} {busy ? 'Masuk…' : 'Masuk'}
                </Button>
              </form>
              <div className="mt-5 border-t border-border pt-4 text-center text-sm text-muted-foreground">
                Belum punya akun?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('request')}
                  className="font-semibold text-primary underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  Ajukan akun
                </button>
              </div>
            </>
          ) : null}

          {mode === 'request' ? (
            <>
              <h2 className="mb-1 text-base font-bold">Ajukan akun</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Isi data di bawah. Akun aktif setelah disetujui admin, lalu kamu bisa masuk dengan username dan
                password ini.
              </p>
              <form onSubmit={onRequest} className="flex flex-col gap-4">
                <Field label="Nama In Character (IC)">
                  <Input
                    autoFocus
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    required
                  />
                </Field>
                <Field label="Username" hint="3–30 karakter: huruf kecil, angka, titik, atau strip.">
                  <Input
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    maxLength={30}
                    required
                  />
                </Field>
                <Field label="Password" hint="Minimal 8 karakter.">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Ulangi password">
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </Field>
                {/* Kolom jebakan: disembunyikan dari manusia dan pembaca layar, bot sering mengisinya. */}
                <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>
                    Website
                    <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </label>
                </div>
                {error ? (
                  <p role="alert" className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button type="submit" disabled={busy} className="h-10">
                  {busy ? <Loader2 className="animate-spin" /> : <UserPlus />} {busy ? 'Mengirim…' : 'Kirim permintaan'}
                </Button>
                <Button type="button" variant="ghost" onClick={() => switchMode('login')}>
                  <ArrowLeft /> Kembali ke login
                </Button>
              </form>
            </>
          ) : null}

          {mode === 'sent' ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="size-10 text-emerald-400" aria-hidden />
              <h2 className="text-base font-bold">Permintaan terkirim</h2>
              <p className="text-sm text-muted-foreground">
                Admin akan memeriksa permintaanmu. Setelah disetujui, masuk dengan username{' '}
                <span className="font-semibold text-foreground">{username}</span> dan password yang tadi kamu isi.
              </p>
              <Button className="mt-2 w-full" onClick={() => switchMode('login')}>
                <LogIn /> Ke halaman login
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
