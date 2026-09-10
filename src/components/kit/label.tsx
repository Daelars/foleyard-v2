"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// 12px rather than 14px: a label names the field under it and should not
// compete with the 13px value the user types into it.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn(
        "text-[12px] leading-none font-medium text-zinc-300",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-[var(--state-disabled-opacity)]",
        className
      )}
      {...props}
    />
  )
}

export { Label }
