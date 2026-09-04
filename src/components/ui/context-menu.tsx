"use client"

import * as React from "react"
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu"
import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

function ContextMenuTrigger({ className, ...props }: ContextMenuPrimitive.Trigger.Props) {
  return (
    <ContextMenuPrimitive.Trigger
      data-slot="context-menu-trigger"
      className={cn(className)}
      {...props}
    />
  )
}

function ContextMenuContent({
  align = "start",
  alignOffset = 0,
  sideOffset = 4,
  className,
  ...props
}: ContextMenuPrimitive.Popup.Props &
  Pick<ContextMenuPrimitive.Positioner.Props, "align" | "alignOffset" | "sideOffset">) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        sideOffset={sideOffset}
      >
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-content"
          className={cn(
            "z-50 w-60 origin-(--transform-origin) overflow-hidden rounded-2xl border border-white/10 bg-shell/85 p-1.5 text-popover-foreground shadow-glow-accent backdrop-blur-2xl duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuItem({
  className,
  inset,
  ...props
}: ContextMenuPrimitive.Item.Props & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-zinc-300 outline-hidden transition-colors select-none hover:bg-white/[0.04] focus:bg-white/[0.04] focus:text-zinc-50 data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  )
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: ContextMenuPrimitive.CheckboxItem.Props) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-zinc-300 outline-hidden transition-colors select-none focus:bg-white/[0.04] focus:text-zinc-50 data-checked:bg-accent-fill/10 data-checked:font-semibold data-checked:text-zinc-50 data-checked:ring-1 data-checked:ring-inset data-checked:ring-accent-fill/30 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none flex size-4 shrink-0 items-center justify-center text-accent-text"
        data-slot="context-menu-checkbox-item-indicator"
      >
        <ContextMenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </ContextMenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  )
}

function ContextMenuLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="context-menu-label"
      className={cn("px-2.5 pb-1 pt-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-zinc-500", className)}
      {...props}
    />
  )
}

function ContextMenuSeparator({
  className,
  ...props
}: ContextMenuPrimitive.Separator.Props) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("my-1 h-px bg-white/5", className)}
      {...props}
    />
  )
}

function ContextMenuSub({ ...props }: ContextMenuPrimitive.SubmenuRoot.Props) {
  return <ContextMenuPrimitive.SubmenuRoot data-slot="context-menu-sub" {...props} />
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: ContextMenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.SubmenuTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex w-full cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-zinc-300 outline-hidden transition-colors select-none hover:bg-white/[0.04] focus:bg-white/[0.04] focus:text-zinc-50 data-inset:pl-7 data-popup-open:bg-accent-fill/10 data-popup-open:font-semibold data-popup-open:text-zinc-50 data-popup-open:ring-1 data-popup-open:ring-inset data-popup-open:ring-accent-fill/30 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
    </ContextMenuPrimitive.SubmenuTrigger>
  )
}

function ContextMenuSubContent({
  className,
  ...props
}: ContextMenuPrimitive.Popup.Props) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner sideOffset={12}>
        <ContextMenuPrimitive.Popup
          data-slot="context-menu-sub-content"
          className={cn(
            "z-50 w-52 origin-(--transform-origin) overflow-hidden rounded-2xl border border-white/10 bg-shell/85 p-1.5 text-popover-foreground shadow-glow-accent backdrop-blur-2xl duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  )
}

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
}
