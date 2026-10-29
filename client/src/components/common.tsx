import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, Check, ChevronDown, Inbox, Package, Search, type LucideIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/* ---------- Page layout ---------- */

export function PageStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 sm:gap-5">{children}</div>
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
        {subtitle ? <p className="mt-1 text-[0.8125rem] text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}

/* ---------- Form ---------- */

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-semibold text-muted-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

/** `image`: undefined = tanpa gambar, null = pakai ikon pengganti, string = URL thumbnail. */
export type Option = { value: string; label: string; image?: string | null }

function OptionLabel({ option }: { option: Option }) {
  if (option.image === undefined) return <>{option.label}</>
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded bg-black/30">
        {option.image ? (
          <img src={option.image} alt="" loading="lazy" className="size-full object-contain" />
        ) : (
          <Package className="size-3.5 text-muted-foreground/60" aria-hidden />
        )}
      </span>
      <span className="truncate">{option.label}</span>
    </span>
  )
}

// Dropdown dengan kotak pencarian (filter saat mengetik, navigasi panah + Enter).
function SearchSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  className,
  disabled,
  id,
}: {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  emptyLabel?: string
  className?: string
  disabled?: boolean
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const all = useMemo<Option[]>(
    () => (emptyLabel ? [{ value: '', label: emptyLabel }, ...options] : options),
    [emptyLabel, options],
  )
  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => (q ? all.filter((o) => o.label.toLowerCase().includes(q)) : all), [all, q])
  const selected = all.find((o) => o.value === value)

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function choose(o: Option) {
    onChange(o.value)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[active]) choose(filtered[active])
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setQuery('')
          setActive(Math.max(0, all.findIndex((o) => o.value === value)))
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {selected ? <OptionLabel option={selected} /> : placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="relative border-b border-border p-2">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Cari…"
            aria-label="Cari"
            className="h-8 w-full rounded-md bg-muted/50 pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Tidak ditemukan</p>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.value || '__empty__'}
                type="button"
                role="option"
                aria-selected={o.value === value}
                data-index={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  i === active && 'bg-accent text-accent-foreground',
                )}
              >
                <span className="min-w-0 flex-1">
                  <OptionLabel option={o} />
                </span>
                {o.value === value ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Radix Select tidak mengizinkan value kosong, jadi "semua"/kosong dipetakan ke sentinel.
const NONE = '__none__'

// Daftar dengan lebih dari ini otomatis memakai kotak pencarian.
const SEARCH_THRESHOLD = 6

export function OptionSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel,
  className,
  disabled,
  id,
  searchable,
}: {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  /** Bila diisi, ditambahkan pilihan pertama dengan value kosong (mis. "Semua lokasi"). */
  emptyLabel?: string
  className?: string
  disabled?: boolean
  id?: string
  /** Paksa kotak pencarian aktif/mati. Bawaan: aktif bila pilihan lebih dari 6. */
  searchable?: boolean
}) {
  if (searchable ?? options.length > SEARCH_THRESHOLD) {
    return (
      <SearchSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
        emptyLabel={emptyLabel}
        className={className}
        disabled={disabled}
        id={id}
      />
    )
  }
  return (
    <Select
      value={value === '' ? (emptyLabel ? NONE : '') : value}
      onValueChange={(v) => onChange(v === NONE ? '' : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={cn('w-full', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel ? <SelectItem value={NONE}>{emptyLabel}</SelectItem> : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.image === undefined ? (
              o.label
            ) : (
              <span className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded bg-black/30">
                  {o.image ? (
                    <img src={o.image} alt="" loading="lazy" className="size-full object-contain" />
                  ) : (
                    <Package className="size-3.5 text-muted-foreground/60" aria-hidden />
                  )}
                </span>
                {o.label}
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/* ---------- Filter tab (segmented control) ---------- */

export function FilterTabs({
  value,
  onChange,
  tabs,
  label = 'Filter',
}: {
  value: string
  onChange: (value: string) => void
  /** `count` > 0 menampilkan angka penanda di tab (mis. jumlah yang butuh tindakan). */
  tabs: { value: string; label: string; count?: number }[]
  label?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex w-full max-w-full gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted/40 p-0.5 sm:w-fit"
    >
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              active
                ? 'bg-primary/15 text-primary ring-1 ring-primary/35'
                : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground',
            )}
          >
            {t.label}
            {t.count ? (
              <span
                className={cn(
                  'ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] leading-5 font-semibold tabular-nums',
                  active ? 'bg-primary text-primary-foreground' : 'bg-primary/20 text-primary',
                )}
                aria-label={`${t.count} perlu tindakan`}
              >
                {t.count > 99 ? '99+' : t.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- Badge dengan nada ---------- */

export function ToneBadge({
  tone = 'default',
  children,
}: {
  tone?: 'default' | 'good' | 'bad' | 'warn'
  children: ReactNode
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        tone === 'good' && 'bg-emerald-500/15 text-emerald-300',
        tone === 'bad' && 'bg-destructive/15 text-destructive',
        tone === 'warn' && 'bg-primary/15 text-primary',
      )}
    >
      {children}
    </Badge>
  )
}

/* ---------- KPI ---------- */

export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint?: string
  icon: LucideIcon
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/25">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-xl leading-tight font-bold tabular-nums">{value}</p>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}

/* ---------- Status ---------- */

export function LoadingState() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Memuat">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-2 h-64 rounded-xl" />
    </div>
  )
}

export function EmptyState({ text = 'Belum ada data' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-14 text-center text-sm text-muted-foreground">
      <Inbox className="size-8 opacity-50" aria-hidden />
      {text}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <AlertCircle className="size-6 text-destructive" aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      ) : null}
    </div>
  )
}
