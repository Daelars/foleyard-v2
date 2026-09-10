import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Foleyard action control, built to variant I (the D kit's button with the G
// kit's motion).
//
// Every button is the same object — an edged surface with a 1px top highlight
// over a close shadow — and the tones differ in what fills it:
//
//   default      accent glass: an accent gradient with a lit edge and an
//                accent-tinted glow. Not a flat coral fill.
//   outline      charcoal glass, the control gradient over a hairline edge.
//   secondary    the same charcoal glass, one step quieter.
//   ghost        no material until hover, when the edge and fill arrive.
//   destructive  keeps the dark body and speaks through an accent edge and
//                label, so it never competes with the primary action.
//
// 36/32px at rounded-lg, 36px icon buttons and a 44px transport-scale icon
// button. Motion is the G kit's: hover lifts a pixel, press squashes to 0.97,
// and both resolve instantly under reduced motion.
//
// Disabled is a construction, not an opacity: the control sinks into a well
// with a visible edge and a zinc-400 label. The kit's note is explicit that
// "off" must read through shape rather than through near-invisible text, so a
// disabled toolbar action stays legible instead of becoming debris.

const buttonVariants = cva(
  [
    "group/button relative inline-flex shrink-0 items-center justify-center gap-2",
    "rounded-lg border font-medium whitespace-nowrap select-none",
    "transition-[background-color,background-image,border-color,box-shadow,color,transform] duration-150 motion-reduce:transition-none",
    "outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "motion-safe:hover:-translate-y-px motion-safe:active:translate-y-px motion-safe:active:scale-[0.97]",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30",
    // Off reads as a sunken well with a legible label, never as faded text.
    "disabled:pointer-events-none disabled:translate-y-0 disabled:scale-100",
    "disabled:border-edge-hover disabled:bg-mat-inset disabled:bg-none disabled:text-zinc-400",
    "disabled:shadow-elev-well disabled:[&_svg]:text-zinc-400",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "border-edge-accent text-white bg-[image:var(--mat-accent)] shadow-elev-accent",
          "hover:border-edge-accent-hover hover:bg-[image:var(--mat-accent-hover)] hover:shadow-elev-accent-hover",
          "active:shadow-elev-sink active:brightness-90",
          "[&_svg]:text-white",
        ].join(" "),
        outline: [
          "border-edge text-zinc-200 bg-[image:var(--mat-control)] shadow-elev-lift",
          "hover:border-edge-hover hover:bg-[image:var(--mat-control-hover)] hover:text-zinc-50",
          "active:shadow-elev-sink",
          "aria-expanded:border-edge-hover aria-expanded:bg-[image:var(--mat-control-hover)] aria-expanded:text-zinc-50",
          "[&_svg]:text-zinc-400",
        ].join(" "),
        secondary: [
          "border-edge text-zinc-300 bg-[image:var(--mat-control)] shadow-elev-lift",
          "hover:border-edge-hover hover:bg-[image:var(--mat-control-hover)] hover:text-zinc-100",
          "active:shadow-elev-sink",
          "aria-expanded:border-edge-hover aria-expanded:text-zinc-50",
          "[&_svg]:text-zinc-500",
        ].join(" "),
        ghost: [
          "border-transparent text-zinc-400 shadow-none",
          "hover:border-edge hover:bg-white/[0.04] hover:text-zinc-100",
          "active:shadow-elev-sink",
          "aria-expanded:border-edge aria-expanded:bg-white/[0.04] aria-expanded:text-zinc-100",
          "[&_svg]:text-zinc-500",
        ].join(" "),
        destructive: [
          "border-edge-accent-soft text-accent-text bg-[image:var(--mat-danger)]",
          "shadow-[var(--elev-lift),0_0_14px_color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
          "hover:border-edge-accent hover:bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)]",
          "active:shadow-elev-sink",
          "[&_svg]:text-accent-text",
        ].join(" "),
      },
      size: {
        default: "h-9 px-3.5 text-[13px] [&_svg:not([class*='size-'])]:size-4",
        sm: "h-8 px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        xs: "h-7 gap-1.5 rounded-md px-2.5 text-[11px] [&_svg:not([class*='size-'])]:size-3",
        icon: "size-9 [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        // Transport scale: the play/skip cluster in the player shell.
        "icon-lg": "size-11 [&_svg:not([class*='size-'])]:size-[18px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
