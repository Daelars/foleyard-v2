"use client"

import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { Circle } from "lucide-react"

import { cn } from "@/lib/utils"

function RadioGroup({
  className,
  ...props
}: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  children,
  ...props
}: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "group/radio flex items-center gap-2 text-sm cursor-default outline-none",
        className
      )}
      {...props}
    >
      <div className="flex size-4 shrink-0 items-center justify-center rounded-full border border-white/15 bg-transparent transition-colors group-data-checked/radio:border-accent-fill group-data-checked/radio:bg-accent-fill group-data-hovered/radio:border-accent-fill/50 group-focus-visible/radio:ring-2 group-focus-visible/radio:ring-primary group-focus-visible/radio:ring-offset-2 group-focus-visible/radio:ring-offset-background group-disabled/radio:cursor-not-allowed group-disabled/radio:opacity-50">
        <RadioPrimitive.Indicator className="flex items-center justify-center">
          <Circle className="size-2 fill-white text-white" />
        </RadioPrimitive.Indicator>
      </div>
      {children}
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
