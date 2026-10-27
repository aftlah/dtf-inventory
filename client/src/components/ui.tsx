import { useEffect, useId, type ComponentProps, type ReactNode } from 'react'
import { AlertCircle, Loader2, X, type LucideIcon } from 'lucide-react'
import clsx from 'clsx'

/* ---------- Button ---------- */

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'outline' | 'ghost' | 'danger'
  size?: 'md' | 'sm' | 'icon'
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        size === 'md' && 'h-10 px-4',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'icon' && 'size-10',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'outline' && 'border border-input bg-transparent hover:bg-accent',
        variant === 'ghost' && 'hover:bg-accent',
        variant === 'danger' && 'bg-destructive text-white hover:bg-destructive/90',
        className,
      )}
      {...rest}
    />
  )
}

/* ---------- Form fields ---------- */

const fieldClass =
  'h-10 w-full rounded-lg border border-input bg-muted/60 px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50'

export function Input({ className, ...rest }: ComponentProps<'input'>) {
  return <input className={clsx(fieldClass, className)} {...rest} />
}

export function Select({ className, ...rest }: ComponentProps<'select'>) {
  return <select className={clsx(fieldClass, 'appearance-auto', className)} {...rest} />
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return <textarea className={clsx(fieldClass, 'h-auto min-h-20 py-2', className)} {...rest} />
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

/* ---------- Card / Badge / Kpi ---------- */

export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={clsx('rounded-xl border border-border bg-card', className)} {...rest} />
}

export function Badge({
  tone = 'default',
  children,
}: {
  tone?: 'default' | 'good' | 'bad' | 'warn'
  children: ReactNode
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
        tone === 'default' && 'bg-secondary text-muted-foreground',
        tone === 'good' && 'bg-emerald-500/15 text-emerald-300',
        tone === 'bad' && 'bg-destructive/15 text-destructive',
        tone === 'warn' && 'bg-amber-500/15 text-amber-300',
      )}
    >
      {children}
    </span>
  )
}

export function Kpi({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: LucideIcon }) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-xl leading-tight font-bold tabular-nums">{value}</p>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </Card>
  )
}

/* ---------- Page layout ---------- */

export function PageStack({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 sm:gap-5">{children}</div>
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
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

/* ---------- Table ---------- */

export function Table({ children }: { children: ReactNode }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </Card>
  )
}

export const Th = ({ className, ...rest }: ComponentProps<'th'>) => (
  <th
    className={clsx('border-b border-border px-4 py-2.5 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground', className)}
    {...rest}
  />
)

export const Td = ({ className, ...rest }: ComponentProps<'td'>) => (
  <td className={clsx('border-b border-border/60 px-4 py-2.5 align-middle', className)} {...rest} />
)

/* ---------- Status blocks ---------- */

export function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden /> Memuat…
    </div>
  )
}

export function EmptyState({ text = 'Belum ada data' }: { text?: string }) {
  return <div className="py-16 text-center text-sm text-muted-foreground">{text}</div>
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

/* ---------- Modal ---------- */

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 id={titleId} className="font-bold">
            {title}
          </h3>
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Tutup">
            <X />
          </Button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  )
}
