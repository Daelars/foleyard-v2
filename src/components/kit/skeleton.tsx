import { cn } from "@/lib/utils"

// New shared component: loading tiles were inline `animate-pulse` divs.
// A placeholder is the inset material, because the content has not arrived
// to sit on the surface yet — the hole is there and it is empty.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "rounded-md border border-edge bg-mat-inset motion-safe:animate-pulse",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
