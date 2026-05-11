"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ExtensionDialogShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: "lg" | "xl" | "2xl";
  showCloseButton?: boolean;
  onOpenChangeWrapper?: (open: boolean) => void;
};

const widthClass = {
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
};

export function ExtensionDialogShell({
  open,
  onOpenChange,
  title,
  description,
  icon,
  children,
  footer,
  maxWidth = "lg",
  showCloseButton = true,
  onOpenChangeWrapper,
}: ExtensionDialogShellProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChangeWrapper?.(nextOpen);
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[min(86vh,780px)] flex-col overflow-hidden p-0",
          widthClass[maxWidth],
        )}
      >
        <DialogHeader className="border-b border-border/35 px-6 py-5 pr-12">
          <DialogTitle className="flex items-center gap-2">
            {icon ? <span className="text-primary">{icon}</span> : null}
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="leading-5">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-5">{children}</div>
        </div>

        {(footer || showCloseButton) && (
          <div className="flex flex-col-reverse gap-2 border-t border-border/35 bg-card/80 px-6 py-4 sm:flex-row sm:justify-end">
            {showCloseButton ? (
              <DialogClose render={<Button variant="outline" />}>
                Close
              </DialogClose>
            ) : null}
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
