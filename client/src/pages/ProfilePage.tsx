import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { Field, PageHeader, PageStack } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'

export function ProfilePage() {
  const { user } = useAuth()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (next !== confirm) {
      toast.error('Konfirmasi password tidak sama')
      return
    }
    setBusy(true)
    try {
      await api('/auth/password', { method: 'POST', body: { current, next } })
      toast.success('Password diubah')
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageStack>
      <PageHeader title="Profil" subtitle={`${user?.name} · @${user?.username} · ${user?.role}`} />
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Ganti password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="Password saat ini">
              <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
            </Field>
            <Field label="Password baru" hint="Minimal 8 karakter.">
              <Input type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
            </Field>
            <Field label="Ulangi password baru">
              <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={busy} className="h-10">
              {busy ? <Loader2 className="animate-spin" /> : null} {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </PageStack>
  )
}
