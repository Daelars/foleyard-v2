"use client";

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("space-y-1", className)}
      {...props}
    />
  );
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("overflow-hidden rounded-lg border border-edge bg-mat-raised shadow-elev-raised", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header>
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 px-3.5 text-left text-[13px] font-medium text-zinc-300 transition-[background-image,color] duration-150 hover:bg-[image:var(--mat-control)] hover:text-zinc-100 data-open:bg-[image:var(--mat-control)] data-open:text-zinc-50",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="size-3.5 shrink-0 text-zinc-500 transition-transform duration-200 group-data-open/accordion-item:rotate-180" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className={cn(
        "overflow-hidden border-t border-edge px-3.5 py-3 text-[13px] data-open:animate-in data-open:slide-in-from-top-1 data-open:fade-in-0 data-closed:animate-out data-closed:slide-out-to-top-1 data-closed:fade-out-0",
        className,
      )}
      {...props}
    >
      {children}
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
