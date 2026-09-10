"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

// New shared component. Sorting, format pickers and pack options each built
// their own dropdown out of a button and a menu, so none of them agreed on
// height, hit area or how the current value was shown.
//
// The trigger is a control — the same 30px gradient surface as an outline
// button, because that is what it is: something you press. The popup is
// floating material with the same 30px bands as the menus, so choosing from
// a select and choosing from a context menu feel like one interaction.
// The check sits on the trailing edge rather than indenting every label,
// which keeps a column of values aligned when only one is selected.

function Select({ ...props }: SelectPrimitive.Root.Props<string>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectValue({ ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "inline-flex h-[30px] w-fit shrink-0 items-center justify-between gap-2",
        "rounded-lg border border-edge bg-[image:var(--mat-control)] px-[11px]",
        "text-[13px] font-medium whitespace-nowrap text-zinc-200 shadow-elev-lift",
        "transition-[background-image,border-color,color,box-shadow] duration-150 outline-none",
        "hover:border-edge-hover hover:bg-[image:var(--mat-control-hover)] hover:text-zinc-50",
        "focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "data-popup-open:border-edge-hover data-popup-open:bg-[image:var(--mat-control-hover)]",
        "disabled:pointer-events-none disabled:opacity-[var(--state-disabled-opacity)]",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon className="text-zinc-500">
        <ChevronDown className="size-3.5" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  sideOffset = 6,
  ...props
}: SelectPrimitive.Popup.Props & Pick<SelectPrimitive.Positioner.Props, "sideOffset">) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner sideOffset={sideOffset} className="isolate z-50">
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "z-50 max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin)",
            "overflow-y-auto rounded-lg border border-edge bg-mat-floating py-1",
            "text-zinc-300 shadow-elev-floating backdrop-blur-2xl duration-100 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex h-[30px] cursor-default items-center gap-2 px-3 pr-8",
        "text-[13px] outline-hidden select-none",
        "data-highlighted:bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] data-highlighted:text-zinc-50",
        "data-highlighted:before:absolute data-highlighted:before:inset-y-0 data-highlighted:before:left-0",
        "data-highlighted:before:w-0.5 data-highlighted:before:bg-accent-fill data-highlighted:before:content-['']",
        "data-disabled:pointer-events-none data-disabled:opacity-[var(--state-disabled-opacity)]",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex-1 truncate">{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-3 text-accent-text">
        <Check className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectGroupLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-group-label"
      className={cn(
        "px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-widest text-zinc-600",
        className
      )}
      {...props}
    />
  )
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroupLabel }
