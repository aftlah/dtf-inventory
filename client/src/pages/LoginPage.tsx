import { useState, type FormEvent } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import { brand } from '@/brand'
import { Field } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'

export function LoginPage() {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(username, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk')
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
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
              <p role="alert" className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy} className="h-10">
              {busy ? <Loader2 className="animate-spin" /> : <LogIn />} {busy ? 'Masuk…' : 'Masuk'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
