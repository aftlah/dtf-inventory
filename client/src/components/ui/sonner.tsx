import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, OctagonXIcon } from "lucide-react"

const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="dark"
    position="top-right"
    icons={{
      success: <CircleCheckIcon className="size-4 text-emerald-400" />,
      error: <OctagonXIcon className="size-4 text-destructive" />,
    }}
    style={
      {
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)",
        "--border-radius": "var(--radius)",
      } as React.CSSProperties
    }
    {...props}
  />
)

export { Toaster }
