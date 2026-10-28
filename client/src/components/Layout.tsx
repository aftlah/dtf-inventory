import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronsUpDown,
  ClipboardList,
  FlaskConical,
  HandCoins,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  PackageOpen,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  Store,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { brand } from '@/brand'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NotificationBell } from '@/components/NotificationBell'
import { useAuth } from '@/contexts/AuthContext'

type Access = 'staff' | 'admin'
type NavItem = { to: string; label: string; icon: LucideIcon; access?: Access }
type NavGroup = { title: string; items: NavItem[]; access?: Access }

const groups: NavGroup[] = [
  {
    title: 'Utama',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Pembelian',
    items: [
      { to: '/market', label: 'Market', icon: Store },
      { to: '/orders', label: 'Pesanan', icon: Receipt },
    ],
  },
  {
    title: 'Penjualan',
    items: [
      { to: '/sales/new', label: 'Ajukan Penjualan', icon: PackageOpen },
      { to: '/sales', label: 'Status Penjualan', icon: ClipboardList },
      { to: '/buyback/new', label: 'Jual Barang', icon: HandCoins },
      { to: '/buyback', label: 'Status Jual Barang', icon: ClipboardList },
    ],
  },
  {
    title: 'Pemrosesan',
    items: [
      { to: '/process/new', label: 'Ajukan Pemrosesan', icon: FlaskConical },
      { to: '/process', label: 'Status Pemrosesan', icon: ClipboardList },
    ],
  },
  {
    title: 'Inventory',
    access: 'staff',
    items: [
      { to: '/stock', label: 'Stok', icon: Boxes },
      { to: '/movements', label: 'Masuk / Keluar', icon: PackagePlus },
      { to: '/log', label: 'Riwayat', icon: ArrowLeftRight },
      { to: '/items', label: 'Katalog Barang', icon: Package },
      { to: '/locations', label: 'Lokasi', icon: MapPin },
    ],
  },
  {
    title: 'Keuangan',
    access: 'staff',
    items: [
      { to: '/finance', label: 'Laporan Keuangan', icon: Wallet },
      { to: '/cash', label: 'Buku Kas', icon: BookOpen },
    ],
  },
  {
    title: 'Admin',
    access: 'staff',
    items: [
      { to: '/audit', label: 'Log Aktivitas', icon: History },
      { to: '/users', label: 'Pengguna', icon: Users, access: 'admin' },
    ],
  },
]

const navClass = ({ isActive }: { isActive: boolean }) =>
  [
    'group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary/15 text-primary shadow-[inset_2px_0_0_0_var(--primary)]'
      : 'text-muted-foreground hover:bg-accent/80 hover:text-foreground',
  ].join(' ')

function UserMenu() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-accent/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary"
            aria-hidden
          >
            {(user?.name ?? '?').trim().charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user?.name}</span>
            <span className="block truncate text-xs text-muted-foreground capitalize">{user?.role}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">{user?.name}</span>
          <span className="block text-xs text-muted-foreground">@{user?.username}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <User /> Profil &amp; password
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={signOut}>
          <LogOut /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const COLLAPSED_KEY = 'dtf-inv-nav-collapsed'

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin, isStaff, user } = useAuth()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed)

  function toggle(title: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [title]: !prev[title] }
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
      } catch {
        // abaikan
      }
      return next
    })
  }

  const visible = useMemo(() => {
    const allowed = (a?: Access) => !a || (a === 'admin' ? isAdmin : isStaff)
    return groups
      .filter((g) => allowed(g.access))
      .map((g) => ({
        ...g,
        items: g.items
          .filter((i) => allowed(i.access))
          // Member hanya melihat pesanannya sendiri.
          .map((i) => (i.to === '/orders' && user?.role === 'member' ? { ...i, label: 'Pesanan Saya' } : i)),
      }))
      .filter((g) => g.items.length)
  }, [isAdmin, isStaff, user?.role])

  return (
    <div className="flex h-full w-60 flex-col">
      <div className="border-b border-border px-4 pt-5 pb-4 text-center">
        {brand.logo ? (
          <img src={brand.logo} alt={brand.name} className="mx-auto w-32 max-w-full" />
        ) : (
          <p className="text-3xl font-extrabold tracking-tight text-primary">{brand.name}</p>
        )}
        <p className="mt-2 text-[10px] font-semibold tracking-[0.22em] text-muted-foreground uppercase">
          {brand.subtitle}
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {visible.map((g) => {
          // Grup yang berisi halaman aktif selalu terbuka.
          const hasActive = g.items.some((i) => pathname === i.to)
          const open = hasActive || !collapsed[g.title]
          const panelId = `nav-${g.title}`
          return (
            <div key={g.title}>
              <button
                type="button"
                onClick={() => toggle(g.title)}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase transition-colors hover:text-foreground"
              >
                {g.title}
                <ChevronDown className={`size-3.5 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} aria-hidden />
              </button>
              <div
                id={panelId}
                className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
              >
                <div className="overflow-hidden">
                  <div className="flex flex-col gap-0.5 pt-1 pb-1">
                    {g.items.map(({ to, label, icon: Icon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end
                        className={navClass}
                        onClick={onNavigate}
                        tabIndex={open ? 0 : -1}
                      >
                        <Icon className="size-4 opacity-80" aria-hidden />
                        {label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </nav>
      <div className="border-t border-border p-3">
        <UserMenu />
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

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

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
          <div className="flex-1" />
          <NotificationBell />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 p-3 sm:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
