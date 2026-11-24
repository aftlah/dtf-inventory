import { ChevronDown, LogOut, User } from 'lucide-react'
import { Link, Outlet, useNavigate } from 'react-router-dom'
import { brand } from '@/brand'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Kerangka untuk akun yang hanya boleh absen (Holly, Hangaround): tanpa sidebar karena hanya ada satu halaman.
 * Bilah atas berisi logo dan menu akun (profil/ganti password, keluar); isinya satu kolom di tengah layar.
 */
export function AttendanceLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="app-shell flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <Link
            to="/attendance"
            className="flex min-w-0 items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {brand.logo ? (
              <img src={brand.logo} alt={brand.name} className="h-10 w-auto" />
            ) : (
              <span className="text-2xl font-extrabold tracking-tight text-primary">{brand.name}</span>
            )}
            <span className="hidden text-[10px] leading-tight font-semibold tracking-[0.2em] text-muted-foreground uppercase sm:block">
              {brand.subtitle}
            </span>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex shrink-0 items-center gap-2.5 rounded-lg p-1.5 pr-2 text-left transition-colors hover:bg-accent/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span
                  className="flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary"
                  aria-hidden
                >
                  {(user?.name ?? '?').trim().charAt(0).toUpperCase()}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block max-w-32 truncate text-sm leading-tight font-medium">{user?.name}</span>
                  <span className="block text-xs leading-tight text-muted-foreground capitalize">{user?.role}</span>
                </span>
                <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
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
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
        <Outlet />
      </main>
    </div>
  )
}
