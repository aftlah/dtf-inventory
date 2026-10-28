import { useCallback, useEffect, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import type { NotificationRow } from '@/lib/types'
import { cn } from '@/lib/utils'

const POLL_MS = 30_000

// Lonceng notifikasi: jumlah belum dibaca, daftar terbaru, klik untuk membuka halaman terkait.
export function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<{ unread: number; rows: NotificationRow[] }>({ unread: 0, rows: [] })

  const load = useCallback(async () => {
    try {
      setData(await api<{ unread: number; rows: NotificationRow[] }>('/notifications'))
    } catch {
      // gagal sementara (offline/sesi habis): coba lagi pada polling berikutnya
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  async function markRead(body: { ids: number[] } | { all: true }) {
    await api('/notifications/read', { method: 'POST', body }).catch(() => {})
    void load()
  }

  function openNotification(n: NotificationRow) {
    if (!n.read_at) void markRead({ ids: [n.id] })
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) void load() }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifikasi${data.unread ? `, ${data.unread} belum dibaca` : ''}`}>
          <Bell />
          {data.unread > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-bold text-white">
              {data.unread > 99 ? '99+' : data.unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))]">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <p className="text-sm font-bold">Notifikasi</p>
          <Button
            variant="ghost"
            size="xs"
            disabled={data.unread === 0}
            onClick={() => void markRead({ all: true })}
          >
            <CheckCheck /> Tandai semua dibaca
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {data.rows.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">Belum ada notifikasi</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {data.rows.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={cn(
                      'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/60',
                      !n.read_at && 'bg-primary/5',
                    )}
                  >
                    <span
                      className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-primary')}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm', !n.read_at && 'font-semibold')}>{n.title}</span>
                      {n.body ? <span className="block truncate text-xs text-muted-foreground">{n.body}</span> : null}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{formatDateTime(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
