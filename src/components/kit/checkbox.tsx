"use client"

import * as React from "react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import { Check, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

// New shared component, built to variant I. Selection in the file table and
// in the bulk dialogs was ad-hoc markup at each call site.
//
// An 18px sunken well at a 5px radius — square where the radio is round, so
// "any of these" and "one of these" are distinguishable without reading the
// group around them. Checked fills with the accent gradient and lights; the
// mark is white rather than accent so it stays readable on the tinted fill.

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "group/checkbox peer grid size-[18px] shrink-0 place-items-center rounded-[5px] border text-transparent",
        "border-edge-hover bg-mat-inset shadow-elev-well",
        "transition-[background-color,background-image,border-color,box-shadow,color] duration-150",
        "focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "data-[checked]:border-[color-mix(in_oklab,var(--accent-fill)_65%,transparent)]",
        "data-[checked]:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_60%,transparent),color-mix(in_oklab,var(--accent-fill)_35%,transparent))]",
        "data-[checked]:text-white data-[checked]:shadow-[0_0_14px_color-mix(in_oklab,var(--accent-fill)_20%,transparent)]",
        "data-[indeterminate]:border-[color-mix(in_oklab,var(--accent-fill)_65%,transparent)] data-[indeterminate]:text-white",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-150"
      >
        {props.indeterminate ? (
          <Minus className="size-3" />
        ) : (
          <Check className="size-3" strokeWidth={2.4} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
