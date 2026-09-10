"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

// Variant I's switch: a 40x22 sunken track carrying a 16px thumb, inside a
// 44x28 hit area. On-ness is an accent-filled track with a glow *and* the
// thumb's travel, never colour alone.
//
// The thumb is a white-to-zinc gradient with a close drop shadow — the one
// deliberately bright object in the library, because it is the moving part
// and its position is the state. Travel is bounded by explicit left stops
// (3px to 21px inside a 40px track) so it cannot escape over the label, and
// "left" animates on its own rather than sharing "translate" with the
// vertical centring.

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "group relative grid h-7 w-11 shrink-0 cursor-pointer place-items-center outline-none",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "relative h-[22px] w-[40px] rounded-full border shadow-elev-well",
          "transition-[background-color,background-image,border-color,box-shadow] duration-150 motion-reduce:transition-none",
          "border-edge-hover bg-mat-inset",
          "group-data-[checked]:border-edge-accent",
          "group-data-[checked]:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_55%,transparent),color-mix(in_oklab,var(--accent-fill)_32%,transparent))]",
          "group-data-[checked]:shadow-[var(--elev-well),0_0_16px_color-mix(in_oklab,var(--accent-fill)_22%,transparent)]",
          "group-focus-visible:ring-2 group-focus-visible:ring-[var(--focus-ring)] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-canvas"
        )}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            "absolute top-1/2 size-4 -translate-y-1/2 rounded-full",
            "bg-[linear-gradient(180deg,#e4e4e7,#a1a1aa)] shadow-[0_1px_3px_rgba(0,0,0,0.6)]",
            "transition-[left] duration-150 motion-reduce:transition-none",
            "data-[unchecked]:left-[3px]",
            "data-[checked]:left-[21px] data-[checked]:bg-[linear-gradient(180deg,#ffffff,#d4d4d8)]"
          )}
        />
      </span>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
