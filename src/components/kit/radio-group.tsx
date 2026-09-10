"use client"

import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { Radio as RadioPrimitive } from "@base-ui/react/radio"

import { cn } from "@/lib/utils"

// The checkbox's twin, round instead of square, at the same 18px so the two
// line up in a mixed options list. Checked fills with the accent gradient and
// glows, and raises a white dot — the same moving-part treatment as the
// switch thumb, so "this one" reads positionally as well as chromatically.

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("flex flex-col gap-2.5", className)}
      {...props}
    />
  )
}

function RadioGroupItem({ className, children, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "group/radio flex cursor-pointer items-center gap-2.5 text-[13px] text-zinc-300 outline-none",
        "hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-full border",
          "border-edge-hover bg-mat-inset shadow-elev-well",
          "transition-[background-color,background-image,border-color,box-shadow] duration-150",
          "group-data-checked/radio:border-[color-mix(in_oklab,var(--accent-fill)_65%,transparent)]",
          "group-data-checked/radio:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_60%,transparent),color-mix(in_oklab,var(--accent-fill)_35%,transparent))]",
          "group-data-checked/radio:shadow-[0_0_14px_color-mix(in_oklab,var(--accent-fill)_20%,transparent)]",
          "group-focus-visible/radio:ring-2 group-focus-visible/radio:ring-[var(--focus-ring)]",
          "group-focus-visible/radio:ring-offset-2 group-focus-visible/radio:ring-offset-canvas"
        )}
      >
        <RadioPrimitive.Indicator className="flex items-center justify-center">
          <span className="size-1.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
        </RadioPrimitive.Indicator>
      </span>
      {children}
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
