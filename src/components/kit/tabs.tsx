"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Variant I's tab bar: a 36px sunken well holding 28px tabs, where the active
// tab is an accent pill — an accent edge over an accent tint with a glow and
// a 1px top highlight. The well and the pill are the same relationship as a
// switch track and its thumb, at a different scale, which is what makes the
// two controls look like they came from one place.
//
//   default  the well and pill, for board bars and filter groups.
//   line     no container, an accent rule against the active tab, for the
//            settings rail where a well would box in a panel that already
//            has an edge.

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  [
    "group/tabs-list relative inline-flex w-fit items-center text-zinc-500",
    "group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:items-stretch",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "gap-0.5 rounded-lg border border-edge bg-mat-inset p-1 shadow-elev-well group-data-horizontal/tabs:h-9",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative z-10 flex h-7 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap",
        "rounded-md border border-transparent px-2.5 text-xs font-medium outline-none",
        "transition-[background-color,border-color,box-shadow,color] duration-150 motion-reduce:transition-none",
        "group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start",
        "hover:text-zinc-200",
        "focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
        "disabled:pointer-events-none disabled:opacity-60",
        "aria-disabled:pointer-events-none aria-disabled:opacity-60",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        "[&_svg]:text-zinc-600 data-active:[&_svg]:text-accent-text",
        // The accent pill.
        "group-data-[variant=default]/tabs-list:data-active:border-edge-accent-soft",
        "group-data-[variant=default]/tabs-list:data-active:bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)]",
        "group-data-[variant=default]/tabs-list:data-active:text-zinc-50",
        "group-data-[variant=default]/tabs-list:data-active:shadow-[0_0_14px_color-mix(in_oklab,var(--accent-fill)_10%,transparent),inset_0_1px_0_rgba(255,255,255,0.07)]",
        // The rule.
        "group-data-[variant=line]/tabs-list:data-active:text-accent-text",
        "after:absolute after:bg-accent-fill after:opacity-0 after:transition-opacity",
        "group-data-horizontal/tabs:after:inset-x-2.5 group-data-horizontal/tabs:after:-bottom-1 group-data-horizontal/tabs:after:h-0.5",
        "group-data-vertical/tabs:after:inset-y-1 group-data-vertical/tabs:after:left-0 group-data-vertical/tabs:after:w-0.5",
        "group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-[13px] outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
