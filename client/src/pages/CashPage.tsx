import { useState, type FormEvent } from 'react'
import { ArrowDownLeft, ArrowUpRight, Loader2, Plus, Trash2, Wallet } from 'lucide-react'
import {
  EmptyState,
  ErrorState,
  Field,
  FilterTabs,
  Kpi,
  LoadingState,
  OptionSelect,
  PageHeader,
  PageStack,
  ToneBadge,
} from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { useConfirm } from '@/contexts/ConfirmContext'
import { useToast } from '@/contexts/ToastContext'
import { api } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'
import { dateRangeFor, PRESETS, toYmd, type Preset } from '@/lib/period'
import type { CashEntry, CashSummary, CashType, WashStatus } from '@/lib/types'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'

const INCOME_CATEGORIES = [
  { value: 'sales', label: 'Penjualan' },
  { value: 'market_sales', label: 'Penjualan Market' },
  { value: 'member_deposit', label: 'Setoran member' },
  { value: 'processing_result', label: 'Hasil pemrosesan' },
  { value: 'donation', label: 'Donasi / sumbangan' },
  { value: 'refund', label: 'Pengembalian dana' },
  { value: 'other_income', label: 'Pemasukan lain' },
]
const EXPENSE_CATEGORIES = [
  { value: 'capital_materials', label: 'Modal bahan' },
  { value: 'capital_goods', label: 'Modal barang' },
  { value: 'capital_equipment', label: 'Modal peralatan' },
  { value: 'buyback_payout', label: 'Pembelian dari member' },
  { value: 'wash_fee', label: 'Biaya cuci' },
  { value: 'member_pay', label: 'Gaji / bonus member' },
  { value: 'vehicle', label: 'Kendaraan' },
  { value: 'property', label: 'Sewa / properti' },
  { value: 'tax_fine', label: 'Pajak / denda' },
  { value: 'operations', label: 'Operasional' },
  { value: 'other_expense', label: 'Pengeluaran lain' },
]
const categoryLabel = (c: string) =>
  [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].find((x) => x.value === c)?.label ?? c

const WASH: { value: WashStatus; label: string; dot: string; text: string }[] = [
  { value: 'dirty', label: 'Uang kotor', dot: 'bg-red-400', text: 'text-red-300' },
  { value: 'washing', label: 'Sedang dicuci', dot: 'bg-amber-400', text: 'text-amber-300' },
  { value: 'clean', label: 'Bersih', dot: 'bg-emerald-400', text: 'text-emerald-300' },
]

type Draft = {
  type: CashType
  category: string
  amount: string
  counterparty: string
  note: string
  date: string
  wash_status: WashStatus
}
const emptyDraft = (type: CashType): Draft => ({
  type,
  category: type === 'income' ? INCOME_CATEGORIES[0].value : EXPENSE_CATEGORIES[0].value,
  amount: '',
  counterparty: '',
  note: '',
  date: toYmd(new Date()),
  wash_status: 'dirty',
})

function CategoryBars({ rows, tone }: { rows: CashSummary['expense_by_category']; tone: 'good' | 'bad' }) {
  const max = Math.max(...rows.map((r) => r.amount), 1)
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-muted-foreground">Belum ada data</p>
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.category}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{categoryLabel(r.category)}</span>
            <span className="shrink-0 font-semibold tabular-nums">{formatMoney(r.amount)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', tone === 'good' ? 'bg-emerald-400/80' : 'bg-rose-400/80')}
              style={{ width: `${(r.amount / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function CashPage() {
  const { isAdmin } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()

  const [preset, setPreset] = useState<Preset>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const range = dateRangeFor(preset, customFrom, customTo)

  const qs = new URLSearchParams()
  if (range.from) qs.set('from', range.from)
  if (range.to) qs.set('to', range.to)
  const period = qs.toString()

  const summary = useAsync(() => api<CashSummary>(`/cash/summary?${period}`), [period])
  const entries = useAsync(
    () => api<CashEntry[]>(`/cash/entries?${period}${typeFilter === 'all' ? '' : `&type=${typeFilter}`}`),
    [period, typeFilter],
  )

  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = () => {
    summary.reload()
    entries.reload()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    setBusy(true)
    try {
      await api('/cash/entries', {
        method: 'POST',
        body: { ...draft, amount: Math.floor(Number(draft.amount)), wash_status: draft.type === 'income' ? draft.wash_status : undefined },
      })
      toast.success('Tersimpan')
      setDraft(null)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan')
    } finally {
      setBusy(false)
    }
  }

  async function setWash(id: number, status: string) {
    try {
      await api(`/cash/entries/${id}/wash`, { method: 'POST', body: { status } })
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengubah status')
    }
  }

  async function remove(entry: CashEntry) {
    const ok = await confirm({
      title: 'Hapus catatan ini?',
      description: `${categoryLabel(entry.category)} · ${formatMoney(entry.amount)}. Catatan hilang dari buku kas.`,
      confirmLabel: 'Hapus',
    })
    if (!ok) return
    try {
      await api(`/cash/entries/${entry.id}`, { method: 'DELETE' })
      toast.success('Dihapus')
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus')
    }
  }

  const error = summary.error || entries.error
  if (error) return <ErrorState message={error} onRetry={reload} />

  const s = summary.data
  const poolTotal = s ? s.pools.dirty + s.pools.washing + s.pools.clean : 0
  const isIncome = draft?.type === 'income'

  return (
    <PageStack>
      <PageHeader title="Buku Kas" subtitle="Catat pemasukan dan pengeluaran, ke mana uang keluar, dan status uang kotor → bersih.">
        <Button variant="outline" className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10" onClick={() => setDraft(emptyDraft('income'))}>
          <ArrowDownLeft /> Catat pemasukan
        </Button>
        <Button variant="outline" className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10" onClick={() => setDraft(emptyDraft('expense'))}>
          <ArrowUpRight /> Catat pengeluaran
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3">
        <FilterTabs value={preset} onChange={(v) => setPreset(v as Preset)} tabs={PRESETS} label="Periode" />
        {preset === 'custom' ? (
          <div className="flex items-center gap-2">
            <Input type="date" className="w-40" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Dari tanggal" />
            <span className="text-muted-foreground">–</span>
            <Input type="date" className="w-40" value={customTo} onChange={(e) => setCustomTo(e.target.value)} aria-label="Sampai tanggal" />
          </div>
        ) : null}
      </div>

      {!s ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi label="Pemasukan" value={formatMoney(s.income)} icon={ArrowDownLeft} />
            <Kpi label="Pengeluaran" value={formatMoney(s.expense)} icon={ArrowUpRight} />
            <Kpi label="Saldo periode" value={formatMoney(s.balance)} hint={s.balance < 0 ? 'Defisit' : undefined} icon={Wallet} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Posisi uang (semua pemasukan)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {WASH.map((w) => (
                  <div key={w.value} className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                    <p className={cn('flex items-center gap-1.5 text-xs font-semibold', w.text)}>
                      <span className={cn('size-2 rounded-full', w.dot)} aria-hidden /> {w.label}
                    </p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums">{formatMoney(s.pools[w.value])}</p>
                  </div>
                ))}
              </div>
              {poolTotal > 0 ? (
                <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label="Proporsi uang kotor, dicuci, dan bersih">
                  {WASH.map((w) => (
                    <div key={w.value} className={cn(w.dot, 'h-full')} style={{ width: `${(s.pools[w.value] / poolTotal) * 100}%` }} />
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Uang keluar ke mana</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryBars rows={s.expense_by_category} tone="bad" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Pemasukan per kategori</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryBars rows={s.income_by_category} tone="good" />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold">Catatan transaksi</h3>
        <FilterTabs
          value={typeFilter}
          onChange={setTypeFilter}
          label="Jenis transaksi"
          tabs={[
            { value: 'all', label: 'Semua' },
            { value: 'income', label: 'Pemasukan' },
            { value: 'expense', label: 'Pengeluaran' },
          ]}
        />
      </div>

      {entries.loading && !entries.data ? (
        <LoadingState />
      ) : !entries.data?.length ? (
        <EmptyState text="Belum ada catatan pada periode ini" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Sumber / tujuan</TableHead>
              <TableHead className="text-right">Nominal</TableHead>
              <TableHead>Status uang</TableHead>
              <TableHead>Catatan</TableHead>
              <TableHead>Oleh</TableHead>
              {isAdmin ? <TableHead className="w-12" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.data.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(e.entry_date)}</TableCell>
                <TableCell>
                  <ToneBadge tone={e.type === 'income' ? 'good' : 'bad'}>{categoryLabel(e.category)}</ToneBadge>
                </TableCell>
                <TableCell>
                  {e.counterparty ?? '—'}
                  {e.ref_type ? (
                    <span className="ml-1.5 rounded bg-secondary px-1.5 py-0.5 align-middle text-[10px] font-semibold text-muted-foreground uppercase">
                      Otomatis
                    </span>
                  ) : null}
                </TableCell>
                <TableCell
                  className={cn('text-right font-medium tabular-nums', e.type === 'income' ? 'text-emerald-300' : 'text-rose-300')}
                >
                  {e.type === 'income' ? '+' : '−'}
                  {formatMoney(e.amount)}
                </TableCell>
                <TableCell>
                  {e.wash_status ? (
                    <OptionSelect
                      className="h-8 w-36 text-xs"
                      value={e.wash_status}
                      onChange={(v) => void setWash(e.id, v)}
                      options={WASH.map((w) => ({ value: w.value, label: w.label }))}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-48 truncate text-muted-foreground" title={e.note ?? undefined}>
                  {e.note ?? '—'}
                </TableCell>
                <TableCell>{e.created_by_name}</TableCell>
                {isAdmin ? (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      aria-label="Hapus catatan"
                      onClick={() => void remove(e)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isIncome ? 'Catat pemasukan' : 'Catat pengeluaran'}</DialogTitle>
            <DialogDescription>
              {isIncome ? 'Uang yang masuk, beserta status uangnya (kotor/dicuci/bersih).' : 'Uang yang keluar, beserta tujuannya.'}
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <form id="cash-form" onSubmit={onSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kategori">
                  <OptionSelect
                    value={draft.category}
                    onChange={(category) => setDraft({ ...draft, category })}
                    options={isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES}
                  />
                </Field>
                <Field label="Tanggal">
                  <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} required />
                </Field>
              </div>
              <Field label="Nominal ($)">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  required
                  autoFocus
                />
              </Field>
              <Field label={isIncome ? 'Sumber (opsional)' : 'Dibayar ke / tujuan (opsional)'}>
                <Input
                  maxLength={120}
                  value={draft.counterparty}
                  onChange={(e) => setDraft({ ...draft, counterparty: e.target.value })}
                  placeholder={isIncome ? 'Mis. penjualan Market, nama member' : 'Mis. supplier, nama orang'}
                />
              </Field>
              {isIncome ? (
                <Field label="Status uang">
                  <OptionSelect
                    value={draft.wash_status}
                    onChange={(v) => setDraft({ ...draft, wash_status: v as WashStatus })}
                    options={WASH.map((w) => ({ value: w.value, label: w.label }))}
                  />
                </Field>
              ) : null}
              <Field label="Catatan (opsional)">
                <Textarea rows={2} maxLength={500} className="min-h-16" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
              </Field>
            </form>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>
              Batal
            </Button>
            <Button type="submit" form="cash-form" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} {busy ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageStack>
  )
}
