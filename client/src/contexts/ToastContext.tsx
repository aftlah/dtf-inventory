import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'

// Pembungkus tipis atas sonner supaya halaman cukup memanggil useToast().success/error.
const api = {
  success: (text: string) => void toast.success(text),
  error: (text: string) => void toast.error(text),
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}

export const useToast = () => api
