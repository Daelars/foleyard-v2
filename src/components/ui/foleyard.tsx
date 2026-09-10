"use client";

import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Loader2 } from "lucide-react";
import type { TagOrigin } from "@yard-core";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TagOriginMark } from "@/components/FileTable/tag-origin-mark";

export function SoundTag({
  name,
  selected = false,
  provenance,
  confidence,
  className,
}: {
  name: string;
  selected?: boolean;
  provenance?: TagOrigin | null;
  confidence?: number | null;
  className?: string;
}) {
  return (
    <Badge
      variant={selected ? "default" : "secondary"}
      className={cn("px-1.5 font-mono text-[11px]", className)}
    >
      #{name}
      {provenance ? (
        <TagOriginMark origin={provenance} confidence={confidence} className="ml-0.5" />
      ) : null}
    </Badge>
  );
}

export function StatusBadge({ status, tone = "neutral" }: { status: string; tone?: "neutral" | "ready" | "warning" | "error" }) {
  return <Badge variant="outline" className={cn("font-mono text-[10px] uppercase tracking-wide", tone === "ready" && "border-emerald-400/30 text-emerald-300", tone === "warning" && "border-amber-300/30 text-amber-200", tone === "error" && "border-destructive/40 text-destructive")}>{status}</Badge>;
}

export function SettingRow({ label, description, checked, onCheckedChange, disabled, children }: { label: string; description?: string; checked?: boolean; onCheckedChange?: (checked: boolean) => void; disabled?: boolean; children?: ReactNode }) {
  return (
    <div className="flex min-h-16 items-center gap-4 border-b border-white/[0.07] px-4 py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-zinc-100">{label}</p>
        {description ? <p className="mt-0.5 text-xs leading-5 text-zinc-500">{description}</p> : null}
      </div>
      {children ?? <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />}
    </div>
  );
}

/**
 * Async action that keeps its label while busy. Callers stay disabled
 * (no double-submit) and screen readers hear the busy state. Keep
 * `pendingText` close in length to the idle label so the row does not
 * collapse to a spinner while a job runs.
 */
export function PendingButton({
  pending = false,
  pendingText,
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & {
  pending?: boolean;
  pendingText?: ReactNode;
}) {
  return (
    <Button disabled={disabled ?? pending} aria-busy={pending || undefined} {...props}>
      {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
      {pending && pendingText !== undefined ? pendingText : children}
    </Button>
  );
}

/**
 * Reusable command-palette row. Visual treatment only: the parent owns
 * entry data, filtering, keyboard navigation, and execution, and passes
 * through listbox semantics (`role`, `aria-selected`, `id`).
 */
export function CommandItem({
  active = false,
  hint,
  children,
  className,
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  hint?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-[background-color,border-color,color] duration-150",
        active
          ? "bg-accent-fill/12 text-zinc-50 ring-1 ring-inset ring-accent-fill/40"
          : "text-zinc-300 hover:bg-white/[0.06]",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active ? (
        <kbd className="shrink-0 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
          ↵
        </kbd>
      ) : hint ? (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          {hint}
        </span>
      ) : null}
    </button>
  );
}
