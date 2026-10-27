import { useState, type FormEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
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
  Textarea,
  Th,
} from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { locationKinds } from '@/lib/format'
import type { Location } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'

type Draft = { id?: number; name: string; kind: string; notes: string }
const empty: Draft = { name: '', kind: 'warehouse', notes: '' }

export function LocationsPage() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const { data, error, loading, reload } = useAsync(() => api<Location[]>('/locations'), [])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data) return <LoadingState />

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    setBusy(true)
    try {
      if (draft.id) await api(`/locations/${draft.id}`, { method: 'PUT', body: draft })
      else await api('/locations', { method: 'POST', body: draft })
      toast.success('Tersimpan')
      setDraft(null)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setBusy(false)
    }
  }

  async function remove(loc: Location) {
    if (!window.confirm(`Hapus lokasi "${loc.name}"?`)) return
    try {
      await api(`/locations/${loc.id}`, { method: 'DELETE' })
      toast.success('Dihapus')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus')
    }
  }

  const set = (k: keyof Draft) => (e: { target: { value: string } }) =>
    setDraft((d) => (d ? { ...d, [k]: e.target.value } : d))

  return (
    <PageStack>
      <PageHeader title="Lokasi" subtitle="Tempat penyimpanan barang (gudang, brankas, kendaraan, dll).">
        {isAdmin ? (
          <Button onClick={() => setDraft(empty)}>
            <Plus /> Tambah lokasi
          </Button>
        ) : null}
      </PageHeader>

      {data.length === 0 ? (
        <EmptyState />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Nama</Th>
              <Th>Jenis</Th>
              <Th>Catatan</Th>
              {isAdmin ? <Th className="w-24" /> : null}
            </tr>
          </thead>
          <tbody>
            {data.map((l) => (
              <tr key={l.id}>
                <Td className="font-medium">{l.name}</Td>
                <Td>
                  <Badge>{locationKinds[l.kind] ?? l.kind}</Badge>
                </Td>
                <Td className="text-muted-foreground">{l.notes ?? '—'}</Td>
                {isAdmin ? (
                  <Td>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Ubah ${l.name}`}
                        onClick={() => setDraft({ id: l.id, name: l.name, kind: l.kind, notes: l.notes ?? '' })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        aria-label={`Hapus ${l.name}`}
                        onClick={() => remove(l)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal
        open={draft !== null}
        title={draft?.id ? 'Ubah lokasi' : 'Tambah lokasi'}
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Batal
            </Button>
            <Button type="submit" form="loc-form" disabled={busy}>
              {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </>
        }
      >
        {draft ? (
          <form id="loc-form" onSubmit={save} className="flex flex-col gap-4">
            <Field label="Nama">
              <Input value={draft.name} onChange={set('name')} maxLength={100} required autoFocus />
            </Field>
            <Field label="Jenis">
              <Select value={draft.kind} onChange={set('kind')}>
                {Object.entries(locationKinds).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Catatan">
              <Textarea value={draft.notes} onChange={set('notes')} maxLength={500} />
            </Field>
          </form>
        ) : null}
      </Modal>
    </PageStack>
  )
}
