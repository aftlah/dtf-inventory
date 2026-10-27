import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  Boxes,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { brand } from '@/brand'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui'

type NavItem = { to: string; label: string; icon: LucideIcon; admin?: boolean }
type NavGroup = { title: string; items: NavItem[] }

const groups: NavGroup[] = [
  {
    title: 'Utama',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Inventory',
    items: [
      { to: '/stock', label: 'Stok', icon: Boxes },
      { to: '/movements', label: 'Masuk / Keluar', icon: PackagePlus },
      { to: '/log', label: 'Riwayat', icon: ArrowLeftRight },
      { to: '/items', label: 'Katalog Barang', icon: Package },
      { to: '/locations', label: 'Lokasi', icon: MapPin },
    ],
  },
  {
    title: 'Admin',
    items: [{ to: '/users', label: 'Pengguna', icon: Users, admin: true }],
  },
  {
    title: 'Akun',
    items: [{ to: '/profile', label: 'Profil', icon: User }],
  },
]

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary/15 text-primary shadow-[inset_2px_0_0_0_var(--primary)]'
      : 'text-muted-foreground hover:bg-accent/80 hover:text-foreground',
  ].join(' ')

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, isAdmin, signOut } = useAuth()
  const visible = useMemo(
    () =>
      groups
        .map((g) => ({ ...g, items: g.items.filter((i) => !i.admin || isAdmin) }))
        .filter((g) => g.items.length),
    [isAdmin],
  )

  return (
    <div className="flex h-full w-60 flex-col">
      <div className="border-b border-border px-4 pt-5 pb-4 text-center">
        {brand.logo ? (
          <img src={brand.logo} alt={brand.name} className="mx-auto w-36 max-w-full" />
        ) : (
          <p className="text-3xl font-extrabold tracking-tight text-primary">{brand.name}</p>
        )}
        <p className="mt-2 text-[10px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
          {brand.subtitle}
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        {visible.map((g) => (
          <div key={g.title}>
            <p className="px-2 pb-1 text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
              {g.title}
            </p>
            <div className="flex flex-col gap-0.5">
              {g.items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end className={navClass} onClick={onNavigate}>
                  <Icon className="size-4 opacity-80" aria-hidden />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <div className="mb-2 flex items-center gap-2.5 px-1">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary"
            aria-hidden
          >
            {(user?.name ?? '?').trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{user?.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user?.role}</span>
          </span>
        </div>
        <Button variant="outline" className="w-full" onClick={signOut}>
          <LogOut /> Keluar
        </Button>
      </div>
    </div>
  )
}

const SIDEBAR_KEY = 'dtf-inv-sidebar-open'

function readSidebarOpen() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== '0'
  } catch {
    return true
  }
}

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(readSidebarOpen)

  function toggleSidebar() {
    setSidebarOpen((open) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, open ? '0' : '1')
      } catch {
        // abaikan
      }
      return !open
    })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        if (window.matchMedia('(min-width: 768px)').matches) toggleSidebar()
        else setMobileOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app-shell flex">
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 overflow-hidden bg-card/60 transition-[width] duration-200 ease-out md:block ${
          sidebarOpen ? 'w-60 border-r border-border' : 'w-0'
        }`}
        inert={!sidebarOpen}
      >
        <Sidebar />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" onMouseDown={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative h-full w-60 border-r border-border bg-card"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 size-8"
              onClick={() => setMobileOpen(false)}
              aria-label="Tutup menu"
            >
              <X />
            </Button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/80 px-3 py-2.5 backdrop-blur sm:px-5">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Menu">
            <Menu />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? 'Sembunyikan sidebar' : 'Tampilkan sidebar'}
            title="Ctrl+B"
          >
            {sidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </Button>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-3 sm:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
