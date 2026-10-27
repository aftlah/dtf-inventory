import { useState, type FormEvent } from 'react'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  OptionSelect,
  PageHeader,
  PageStack,
  ToneBadge,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { locationKinds } from '@/lib/format'
import type { Location } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'

type Draft = { id?: number; name: string; kind: string; notes: string; sell_in_market: boolean }
const empty: Draft = { name: '', kind: 'warehouse', notes: '', sell_in_market: false }

export function LocationsPage() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
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
    const ok = await confirm({
      title: `Hapus lokasi "${loc.name}"?`,
      description: 'Hanya bisa bila lokasi sudah kosong. Riwayat lama tetap tersimpan.',
      confirmLabel: 'Hapus',
    })
    if (!ok) return
    try {
      await api(`/locations/${loc.id}`, { method: 'DELETE' })
      toast.success('Dihapus')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus')
    }
  }

  const set = (k: 'name' | 'notes') => (e: { target: { value: string } }) =>
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
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Catatan</TableHead>
              {isAdmin ? <TableHead className="w-24" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.name}</TableCell>
                <TableCell>
                  <ToneBadge>{locationKinds[l.kind] ?? l.kind}</ToneBadge>
                </TableCell>
                <TableCell>
                  <ToneBadge tone={l.sell_in_market ? 'good' : 'default'}>
                    {l.sell_in_market ? 'Dijual' : 'Tidak'}
                  </ToneBadge>
                </TableCell>
                <TableCell className="text-muted-foreground">{l.notes ?? '—'}</TableCell>
                {isAdmin ? (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Ubah ${l.name}`}
                        onClick={() => setDraft({ id: l.id, name: l.name, kind: l.kind, notes: l.notes ?? '', sell_in_market: l.sell_in_market })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Hapus ${l.name}`}
                        onClick={() => remove(l)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? 'Ubah lokasi' : 'Tambah lokasi'}</DialogTitle>
            <DialogDescription>Tempat barang disimpan.</DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="loc-form" onSubmit={save} className="flex flex-col gap-4">
              <Field label="Nama">
                <Input value={draft.name} onChange={set('name')} maxLength={100} required autoFocus />
              </Field>
              <Field label="Jenis">
                <OptionSelect
                  value={draft.kind}
                  onChange={(kind) => setDraft({ ...draft, kind })}
                  options={Object.entries(locationKinds).map(([value, label]) => ({ value, label }))}
                />
              </Field>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="loc-market"
                  checked={draft.sell_in_market}
                  onCheckedChange={(v) => setDraft({ ...draft, sell_in_market: v === true })}
                  className="mt-0.5"
                />
                <Label htmlFor="loc-market" className="flex-col items-start gap-0.5">
                  Dijual di Market
                  <span className="text-xs font-normal text-muted-foreground">
                    Stok di lokasi ini yang tampil dan dijual di Market.
                  </span>
                </Label>
              </div>
              <Field label="Catatan">
                <Textarea value={draft.notes} onChange={set('notes')} maxLength={500} />
              </Field>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Batal
            </Button>
            <Button type="submit" form="loc-form" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageStack>
  )
}
