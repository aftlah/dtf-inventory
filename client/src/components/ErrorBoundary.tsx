import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

type State = { error: Error | null }

/** Menangkap error saat menampilkan halaman, supaya tidak berakhir layar kosong. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Tampilan error:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="size-8 text-destructive" aria-hidden />
        <h1 className="text-lg font-bold">Halaman gagal ditampilkan</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Terjadi kesalahan di aplikasi. Muat ulang halaman; jika masih terjadi, kirim pesan di bawah ini ke admin.
        </p>
        <code className="max-w-md rounded-md bg-muted px-3 py-2 text-xs break-words">{this.state.error.message}</code>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Muat ulang</Button>
          <Button variant="outline" onClick={() => (window.location.href = '/')}>
            Ke beranda
          </Button>
        </div>
      </div>
    )
  }
}
