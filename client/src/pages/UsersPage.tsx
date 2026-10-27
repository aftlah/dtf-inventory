import { useState, type FormEvent } from 'react'
import { Pencil, Plus } from 'lucide-react'
import {
  Badge,
  Button,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  PageStack,
  Select,
  Table,
  Td,
  Th,
} from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import type { Role, UserRow } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'

type Draft = { id?: number; name: string; username: string; role: Role; active: boolean; password: string }
const empty: Draft = { name: '', username: '', role: 'staff', active: true, password: '' }

export function UsersPage() {
  const { user: me } = useAuth()
  const toast = useToast()
  const { data, error, loading, reload } = useAsync(() => api<UserRow[]>('/users'), [])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <PageStack>
      <PageHeader title="Pengguna" subtitle="Kelola akun yang bisa masuk ke inventory.">
        <Button onClick={() => setDraft(empty)}>
          <Plus /> Tambah pengguna
        </Button>
      </PageHeader>

      <Table>
        <thead>
          <tr>
            <Th>Nama</Th>
            <Th>Username</Th>
            <Th>Role</Th>
            <Th>Status</Th>
            <Th className="w-16" />
          </tr>
        </thead>
        <tbody>
          {data.map((u) => (
            <tr key={u.id}>
              <Td className="font-medium">{u.name}</Td>
              <Td className="text-muted-foreground">{u.username}</Td>
              <Td>
                <Badge tone={u.role === 'admin' ? 'warn' : 'default'}>{u.role}</Badge>
              </Td>
              <Td>
                <Badge tone={u.active ? 'good' : 'bad'}>{u.active ? 'Aktif' : 'Nonaktif'}</Badge>
              </Td>
              <Td>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Ubah ${u.name}`}
                  onClick={() =>
                    setDraft({ id: u.id, name: u.name, username: u.username, role: u.role, active: !!u.active, password: '' })
                  }
                >
                  <Pencil />
                </Button>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal
        open={draft !== null}
        title={draft?.id ? 'Ubah pengguna' : 'Tambah pengguna'}
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Batal
            </Button>
            <Button type="submit" form="user-form" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </>
        }
      >
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
            <Field label="Role" hint="Admin: kelola katalog, lokasi, dan pengguna. Staff: catat stok.">
              <Select
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
                disabled={isSelf}
              >
                <option value="staff">Staff</option>
                <option value="admin">Admin</option>
              </Select>
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
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={draft.active}
                  disabled={isSelf}
                  onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                />
                Akun aktif
              </label>
            ) : null}
          </form>
        ) : null}
      </Modal>
    </PageStack>
  )
}
