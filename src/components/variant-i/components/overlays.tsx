"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

import { Kbd } from "./field";

// ---------------------------------------------------------------------------
// Dialog — the variant I confirmation overlay: dark floating panel, hairline
// edge, red ambient shadow, divider, right-aligned actions.
// ---------------------------------------------------------------------------

export function Dialog({
  open,
  onClose,
  labelledBy,
  describedBy,
  children,
  maxWidth = "max-w-sm",
}: {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  describedBy?: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={cn(
          "w-full overflow-hidden rounded-xl border border-[var(--vi-edge-hi)] bg-[#101014]/95 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_60px_rgba(0,0,0,0.65),0_0_40px_color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
          maxWidth,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogTitle({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <h2 id={id} className="text-[15px] font-semibold text-zinc-50">
      {children}
    </h2>
  );
}

export function DialogDescription({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
      {children}
    </div>
  );
}

export function DialogDivider() {
  return <div aria-hidden className="my-4 h-px bg-[var(--vi-edge)]" />;
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>;
}

// ---------------------------------------------------------------------------
// Menu — file-row context actions as an open panel: filename label, icon
// items, separator, danger item. Hover states, checkable favorite.
// ---------------------------------------------------------------------------

export function Menu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--vi-edge-hi)] bg-[#141419] p-1 shadow-[0_16px_44px_rgba(0,0,0,0.6)]">
      <p className="truncate px-2.5 pb-1.5 pt-2 font-mono text-[10.5px] text-zinc-500" title={label}>
        {label}
      </p>
      {children}
    </div>
  );
}

export function MenuItem({
  icon,
  checked = false,
  danger = false,
  meta,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  checked?: boolean;
  danger?: boolean;
  /** Trailing mono detail, e.g. a file count or a "Smart" tag. */
  meta?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-disabled={props.disabled || undefined}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] outline-none transition-[background-color,color,transform] duration-100",
        "motion-safe:active:scale-[0.99]",
        "focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
        danger ? "text-accent-text hover:bg-[color-mix(in_oklab,var(--accent-fill)_10%,transparent)]" : "text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-50",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        danger ? "[&_svg]:text-accent-text" : "[&_svg]:text-zinc-500",
      )}
      {...props}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {meta ? (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">{meta}</span>
      ) : null}
      {checked ? <Check aria-hidden className="size-3.5 shrink-0 text-accent-text" /> : null}
    </button>
  );
}

export function MenuSeparator() {
  return <div aria-hidden className="mx-2 my-1 h-px bg-[var(--vi-edge)]" />;
}

// ---------------------------------------------------------------------------
// Command panel — dark floating surface; selected row is a red-tinted band
// with an edge, idle rows show right-aligned hints.
// ---------------------------------------------------------------------------

export function CommandPanel({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--vi-edge-hi)] bg-[#101014]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_16px_44px_rgba(0,0,0,0.6)]">
      {children}
    </div>
  );
}

export function CommandRow({
  active = false,
  hint,
  icon,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  hint?: string;
  icon?: ReactNode;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-9 w-full items-center gap-3 rounded-md border px-3 text-left text-[13px] transition-colors duration-150",
        active
          ? "border-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_13%,transparent)] text-zinc-50 shadow-[0_0_18px_color-mix(in_oklab,var(--accent-fill)_12%,transparent)]"
          : "border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
      )}
      {...props}
    >
      {icon ? (
        <span
          aria-hidden
          className={cn(
            "flex size-4 shrink-0 items-center justify-center [&_svg]:size-4",
            active ? "text-accent-text" : "text-zinc-600",
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active ? (
        <Kbd>↵</Kbd>
      ) : hint ? (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-600">
          {hint}
        </span>
      ) : null}
    </button>
  );
}

/** Section header grouping palette rows (view / sound / tool …). */
export function CommandSection({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600 first:pt-1">
      {children}
    </p>
  );
}

/** Shortcut footer: navigate / run / close affordances plus result count. */
export function CommandFooter({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-4 border-t border-white/[0.07] px-4 py-2.5 font-mono text-[10px] text-zinc-600">
      <span className="flex items-center gap-1.5">
        <Kbd>↑↓</Kbd> navigate
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>↵</Kbd> run
      </span>
      <span className="flex items-center gap-1.5">
        <Kbd>esc</Kbd> close
      </span>
      <span className="flex-1" />
      <span>
        {count} command{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}

export function TooltipBubble({ children }: { children: ReactNode }) {
  return (
    <span className="relative mb-2.5 rounded-md border border-[var(--vi-edge-hi)] bg-[#17171c] px-2.5 py-1.5 text-xs text-zinc-200 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
      {children}
      <span
        aria-hidden
        className="absolute -bottom-[5px] left-1/2 size-2 -translate-x-1/2 rotate-45 border-b border-r border-[var(--vi-edge-hi)] bg-[#17171c]"
      />
      <span aria-hidden className="absolute -bottom-[7px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-zinc-500" />
    </span>
  );
}