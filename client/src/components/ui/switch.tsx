import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 transition-all outline-none",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        "data-[size=default]:h-7 data-[size=default]:w-12",
        "data-[size=sm]:h-5 data-[size=sm]:w-9",
        "data-[state=checked]:border-emerald-400 data-[state=checked]:bg-emerald-500 data-[state=checked]:shadow-[0_0_0_1px_rgba(52,211,153,0.45),0_0_16px_rgba(52,211,153,0.35)]",
        "data-[state=unchecked]:border-zinc-500/70 data-[state=unchecked]:bg-zinc-800",
        "enabled:hover:brightness-110 enabled:hover:shadow-[0_0_10px_rgba(52,211,153,0.2)]",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-md ring-1 ring-black/15 transition-transform",
          "group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-4",
          "data-[state=checked]:translate-x-[calc(100%-4px)]",
          "data-[state=unchecked]:translate-x-0.5",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
