import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Generic chip: counts, short labels, version strings. Deliberately the
// plainest object in the library.
//
// A badge is recessed and a button is raised. That is the whole distinction,
// and it is structural rather than chromatic: badges take the inset well and
// its inward shadow, buttons take a gradient and a top highlight. Side by
// side in a toolbar you can tell which one you can press without reading
// colour, which is what the old library got wrong when every emphasis in the
// app became a small coral pill.
//
// 20px tall against the 22px xs button, so a badge never passes for the
// smallest action. Radius is the tag step, near-square, because a chip this
// small looks like a dot once its corners round past ~5px.
//
// Literal sound metadata does not belong here — see SoundTag in foleyard.tsx,
// which is its own component rather than this one plus a className.

const badgeVariants = cva(
  [
    "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1",
    "overflow-hidden rounded-md border px-1.5",
    "text-[11px] font-medium whitespace-nowrap",
    "transition-[background-color,border-color,color] duration-150",
    "focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "aria-invalid:border-destructive",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
  ].join(" "),
  {
    variants: {
      variant: {
        // Accent as a tint with a lit edge, never as a solid fill: a badge
        // names something, it does not ask to be pressed.
        default:
          "border-edge-accent bg-[color-mix(in_oklab,var(--accent-fill)_14%,transparent)] text-accent-text shadow-elev-well [a]:hover:border-edge-accent-hover",
        secondary:
          "border-edge bg-mat-inset text-zinc-300 shadow-elev-well [a]:hover:border-edge-hover [a]:hover:text-zinc-100",
        outline:
          "border-edge bg-transparent text-zinc-400 [a]:hover:border-edge-hover [a]:hover:text-zinc-200",
        destructive:
          "border-destructive/40 bg-mat-inset text-destructive shadow-elev-well [a]:hover:border-destructive/70",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
