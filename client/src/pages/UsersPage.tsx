import { useState, type FormEvent } from 'react'
import { Check, Loader2, Pencil, Plus, X } from 'lucide-react'
import {
  EmptyState,
  ErrorState,
  Field,
  FilterTabs,
  LoadingState,
  OptionSelect,
  PageHeader,
  PageStack,
  ToneBadge,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/contexts/AuthContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import type { AccountRequest, Role, UserRow } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'

type Draft = { id?: number; name: string; username: string; role: Role; active: boolean; password: string }
const empty: Draft = { name: '', username: '', role: 'staff', active: true, password: '' }

export function UsersPage() {
  const { user: me } = useAuth()
  const toast = useToast()
  const { data, error, loading, reload } = useAsync(() => api<UserRow[]>('/users'), [])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('users')
  const confirm = useConfirm()
  const requests = useAsync(() => api<AccountRequest[]>('/users/requests'), [])
  const [roles, setRoles] = useState<Record<number, string>>({}) // role pilihan admin per permintaan

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data) return <LoadingState />

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    setBusy(true)
    try {
      if (draft.id) await api(`/users/${draft.id}`, { method: 'PUT', body: draft })
      else await api('/users', { method: 'POST', body: draft })
      toast.success('Tersimpan')
      setDraft(null)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setBusy(false)
    }
  }

  const isSelf = draft?.id === me?.id
  const pending = requests.data ?? []

  async function decide(r: AccountRequest, action: 'approve' | 'reject') {
    if (action === 'reject') {
      const ok = await confirm({
        title: `Tolak permintaan ${r.name}?`,
        description: `@${r.username} tidak akan bisa membuat akun lewat permintaan ini.`,
        confirmLabel: 'Tolak',
      })
      if (!ok) return
    }
    try {
      await api(`/users/requests/${r.id}/${action}`, {
        method: 'POST',
        body: action === 'approve' ? { role: roles[r.id] ?? 'member' } : {},
      })
      toast.success(action === 'approve' ? `Akun @${r.username} dibuat` : 'Permintaan ditolak')
      requests.reload()
      if (action === 'approve') reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memproses permintaan')
      requests.reload()
    }
  }

  return (
    <PageStack>
      <PageHeader title="Pengguna" subtitle="Kelola akun yang bisa masuk ke inventory.">
        <Button onClick={() => setDraft(empty)}>
          <Plus /> Tambah pengguna
        </Button>
      </PageHeader>

      <FilterTabs
        value={tab}
        onChange={setTab}
        label="Daftar pengguna"
        tabs={[
          { value: 'users', label: 'Pengguna' },
          { value: 'requests', label: `Permintaan akun${pending.length ? ` (${pending.length})` : ''}` },
        ]}
      />

      {tab === 'requests' ? (
        pending.length === 0 ? (
          <EmptyState text="Tidak ada permintaan akun yang menunggu" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Diajukan</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-48" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-muted-foreground">@{r.username}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell>
                    <OptionSelect
                      className="h-8 w-32 text-xs"
                      value={roles[r.id] ?? 'member'}
                      onChange={(v) => setRoles((prev) => ({ ...prev, [r.id]: v }))}
                      options={[
                        { value: 'member', label: 'Member' },
                        { value: 'staff', label: 'Staff' },
                      ]}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => void decide(r, 'reject')}>
                        <X /> Tolak
                      </Button>
                      <Button size="sm" onClick={() => void decide(r, 'approve')}>
                        <Check /> Setujui
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nama</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.name}</TableCell>
              <TableCell className="text-muted-foreground">{u.username}</TableCell>
              <TableCell>
                <ToneBadge tone={u.role === 'admin' ? 'warn' : 'default'}>{u.role}</ToneBadge>
              </TableCell>
              <TableCell>
                <ToneBadge tone={u.active ? 'good' : 'bad'}>{u.active ? 'Aktif' : 'Nonaktif'}</ToneBadge>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Ubah ${u.name}`}
                  onClick={() =>
                    setDraft({ id: u.id, name: u.name, username: u.username, role: u.role, active: !!u.active, password: '' })
                  }
                >
                  <Pencil />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Ubah pengguna' : 'Tambah pengguna'}</DialogTitle>
            <DialogDescription>Admin mengelola katalog, lokasi, dan pengguna. Staff mencatat stok dan memproses pesanan. Member hanya bisa belanja di Market.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="user-form" onSubmit={save} className="flex flex-col gap-4">
              <Field label="Nama">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  maxLength={100}
                  required
                  autoFocus
                />
              </Field>
              <Field label="Username" hint={draft.id ? 'Username tidak bisa diubah.' : 'Huruf kecil, angka, titik, strip.'}>
                <Input
                  value={draft.username}
                  onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                  maxLength={50}
                  disabled={!!draft.id}
                  required
                />
              </Field>
              <Field label="Role">
                <OptionSelect
                  value={draft.role}
                  onChange={(role) => setDraft({ ...draft, role: role as Role })}
                  disabled={isSelf}
                  options={[
                    { value: 'member', label: 'Member (hanya Market)' },
                    { value: 'staff', label: 'Staff' },
                    { value: 'admin', label: 'Admin' },
                  ]}
                />
              </Field>
              <Field
                label={draft.id ? 'Password baru (kosongkan bila tidak diubah)' : 'Password'}
                hint="Minimal 8 karakter."
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={draft.password}
                  onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                  minLength={8}
                  required={!draft.id}
                />
              </Field>
              {draft.id ? (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="user-active"
                    checked={draft.active}
                    disabled={isSelf}
                    onCheckedChange={(v) => setDraft({ ...draft, active: v === true })}
                  />
                  <Label htmlFor="user-active">Akun aktif</Label>
                </div>
              ) : null}
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Batal
            </Button>
            <Button type="submit" form="user-form" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageStack>
  )
}
