"use client";

import type { ReactNode } from "react";
import { Check, Info, X } from "lucide-react";

import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import { cn } from "@/lib/utils";

import { Switch } from "./controls";

// ---------------------------------------------------------------------------
// Badges / tags — one tiny LED construction per status; tags are dark
// capsules; the AI score gets the strong red treatment.
// ---------------------------------------------------------------------------

const STATUS = {
  ready: "border-teal-300/30 bg-teal-300/[0.07] text-teal-200",
  processing: "border-amber-300/30 bg-amber-300/[0.07] text-amber-200",
  unavailable: "border-[var(--vi-edge)] bg-white/[0.03] text-zinc-400",
  error: "border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_9%,transparent)] text-accent-text",
};

export function StatusBadge({
  status,
  tone,
}: {
  status: string;
  tone: keyof typeof STATUS;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center whitespace-nowrap rounded-md border px-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        STATUS[tone],
      )}
    >
      {status}
    </span>
  );
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center whitespace-nowrap rounded-md border border-[var(--vi-edge)] bg-white/[0.03] px-2.5 font-mono text-xs text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {children}
    </span>
  );
}

export function AIScore({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center whitespace-nowrap rounded-md border border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_10%,transparent)] px-2.5 font-mono text-xs font-medium text-accent-text shadow-[0_0_14px_color-mix(in_oklab,var(--accent-fill)_10%,transparent)]">
      {children}
    </span>
  );
}

export function Alert({
  tone,
  title,
  body,
  monoTitle = false,
}: {
  tone: "warning" | "error";
  title: string;
  body: string;
  monoTitle?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border px-3.5 py-3",
        tone === "warning" && "border-amber-300/25 bg-amber-300/[0.05]",
        tone === "error" &&
          "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
      )}
    >
      {tone === "warning" ? (
        <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-amber-200/90">
          {title}
        </p>
      ) : (
        <p className="flex items-center gap-2 text-[13px] font-medium text-zinc-100">
          <span aria-hidden className="size-2.5 rounded-full bg-accent-fill" />
          {title}
        </p>
      )}
      <p className={cn("text-xs leading-relaxed text-zinc-400", monoTitle ? "mt-1" : "mt-1")}>
        {body}
      </p>
    </div>
  );
}

/** Progress with an eased fill and a looping shimmer. */
export function Progress({
  percent,
  top,
  bottom,
}: {
  percent: number;
  top: string;
  bottom: string;
}) {
  return (
    <div>
      <p className="text-zinc-100">
        <span className="text-5xl font-bold tracking-tight">{percent}</span>
        <span className="ml-1 text-lg text-zinc-500">%</span>
      </p>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={top}
        className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.07] shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
      >
        <div
          className="relative h-full overflow-hidden rounded-full bg-accent-fill shadow-[0_0_12px_color-mix(in_oklab,var(--accent-fill)_40%,transparent)] transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        >
          <span
            aria-hidden
            className="absolute inset-y-0 w-1/2 bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.35),transparent)] [animation:vi-shimmer_2.4s_ease-in-out_infinite] motion-reduce:[animation:none]"
          />
        </div>
      </div>
      <p className="mt-2.5 font-mono text-[11px] text-zinc-500">{bottom}</p>
    </div>
  );
}

const TOAST_TONES = {
  success: {
    icon: <Check aria-hidden className="size-3.5 text-emerald-300" />,
    ring: "border-emerald-300/25",
  },
  error: {
    icon: <X aria-hidden className="size-3.5 text-accent-text" />,
    ring: "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)]",
  },
  info: {
    icon: <Info aria-hidden className="size-3.5 text-zinc-300" />,
    ring: "border-[var(--vi-edge-hi)]",
  },
};

/** Toast — scan/collection feedback: status icon, title, message, dismiss. */
export function Toast({
  tone,
  title,
  message,
  onDismiss,
}: {
  tone: keyof typeof TOAST_TONES;
  title: string;
  message: string;
  onDismiss?: () => void;
}) {
  const config = TOAST_TONES[tone];
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border bg-[#141419]/95 px-3 py-2.5 shadow-[0_12px_32px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]",
        config.ring,
      )}
    >
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-[var(--vi-edge)] bg-white/[0.04]">
        {config.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-zinc-100">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">{message}</span>
      </span>
      {onDismiss ? (
        <button
          type="button"
          aria-label={`Dismiss: ${title}`}
          onClick={onDismiss}
          className="grid size-6 shrink-0 place-items-center rounded-md text-zinc-600 outline-none transition-colors hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Dot-matrix service glyph with a phase label and a live switch. */
export function DotMatrixStatus({
  label,
  detail,
  active,
  onToggle,
  switchLabel,
}: {
  label: string;
  detail: string;
  active: boolean;
  onToggle: (active: boolean) => void;
  switchLabel: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-3 rounded-lg border border-[var(--vi-edge)] bg-black/25 p-3">
        <DotmSquare3
          size={20}
          dotSize={3}
          speed={1.2}
          animated={active}
          pattern="full"
          className={active ? "text-accent-text" : "text-zinc-500"}
        />
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
            {label}
          </p>
          <p className="truncate text-xs font-medium text-zinc-200">{detail}</p>
        </div>
        <span className="flex-1" />
        <Switch label={switchLabel} checked={active} onCheckedChange={onToggle} />
      </div>
    </div>
  );
}