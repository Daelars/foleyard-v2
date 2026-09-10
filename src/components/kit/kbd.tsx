import { cn } from "@/lib/utils"

// New shared component. Shortcut hints were hand-rolled in the palette, in
// tooltips and in the shortcuts tab, each slightly different. Variant I's key
// is a small raised control with a lit edge — the one non-interactive object
// that takes the lift, because a key is a picture of a physical one.
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md border border-edge-hover",
        "bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))]",
        "px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 shadow-elev-lift [&_svg]:size-3",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }
