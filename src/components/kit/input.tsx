import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Variant I's field: an inset well, darker than a button, at 40px — taller
// than the 36px button beside it because a field is a place you put something
// rather than a thing you press, and those 4px are what make that read.
//
// Focus is an accent edge plus a faint accent glow inside the existing sink,
// so the well stays a well. Invalid tints the fill and the text as well as the
// edge, since a red border alone does not carry on a dark surface.
//
// "overlay" is a real variant, not a call-site override. The palette header
// sits inside a panel that already has an edge and a material, so it takes
// neither. Previously the palette imported this component and then undid its
// height, radius, border, background, padding, shadow and focus styles.

const inputVariants = cva(
  [
    "w-full min-w-0 text-zinc-100 placeholder:text-zinc-600 outline-none",
    "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
    "file:inline-flex file:border-0 file:bg-transparent file:text-[13px] file:font-medium file:text-zinc-100",
    "disabled:cursor-not-allowed disabled:opacity-60",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "h-10 rounded-lg border border-edge bg-mat-inset px-3 text-[13px] shadow-elev-well",
          "hover:border-edge-hover",
          "focus:border-edge-accent focus:shadow-[var(--elev-well),0_0_16px_color-mix(in_oklab,var(--accent-fill)_10%,transparent)]",
          "aria-[invalid=true]:border-edge-accent aria-[invalid=true]:bg-[color-mix(in_oklab,var(--accent-fill)_9%,var(--mat-inset))]",
          "aria-[invalid=true]:text-accent-text aria-[invalid=true]:placeholder:text-accent-text/60",
        ].join(" "),
        overlay: "h-12 border-0 bg-transparent px-0 text-[15px] shadow-none focus:ring-0",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function Input({
  className,
  type,
  variant = "default",
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(inputVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
