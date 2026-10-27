import type { ReactNode } from 'react'
import { AlertCircle, Inbox, type LucideIcon } from 'lucide-react'
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

export type Option = { value: string; label: string }

// Radix Select tidak mengizinkan value kosong, jadi "semua"/kosong dipetakan ke sentinel.
const NONE = '__none__'

export function OptionSelect({
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
  /** Bila diisi, ditambahkan pilihan pertama dengan value kosong (mis. "Semua lokasi"). */
  emptyLabel?: string
  className?: string
  disabled?: boolean
  id?: string
}) {
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
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
