// PROTOTYPE ONLY — variant G element kit. Same dark-acrylic visuals as
// ./variant-d-kit, but every interactive element carries its own
// micro-interaction: buttons lift on hover and squash on press, icon buttons
// pop their glyph, switch thumbs travel on a spring, checks draw in, radio
// dots pop, progress shimmers. Nothing page-level animates. Every animated
// surface renders its end state instantly under reduced motion.

"use client";

import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** Mount once at the variant root. All keyframes G uses, in one place. */
export function GKeyframes() {
  return (
    <style>{`
@keyframes g-menu-in { from { opacity: 0; transform: translateY(-4px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes g-shimmer { from { transform: translateX(-100%); } to { transform: translateX(220%); } }
@keyframes g-pop { 0% { transform: scale(0.5); } 60% { transform: scale(1.12); } 100% { transform: scale(1); } }
@keyframes g-draw { from { stroke-dashoffset: 12; } to { stroke-dashoffset: 0; } }
`}</style>
  );
}

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0e]";

// Same acrylic tones as D. Motion enters through the shared base below:
// hover lifts a pixel, press squashes to 0.97 with the sink shadow.
const G_TONE_BASE =
  "motion-safe:hover:-translate-y-px motion-safe:active:translate-y-px motion-safe:active:scale-[0.97]";

const G_PRIMARY_BASE = [
  "border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] text-white",
  "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_36%,transparent),color-mix(in_oklab,var(--accent-fill)_20%,transparent))]",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_0_1px_color-mix(in_oklab,var(--accent-fill)_8%,transparent),0_4px_18px_color-mix(in_oklab,var(--accent-fill)_14%,transparent)]",
  "[&_svg]:text-white",
].join(" ");

const G_PRIMARY_LIT = [
  "border-[color-mix(in_oklab,var(--accent-fill)_90%,transparent)]",
  "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_48%,transparent),color-mix(in_oklab,var(--accent-fill)_30%,transparent))]",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_color-mix(in_oklab,var(--accent-fill)_12%,transparent),0_4px_26px_color-mix(in_oklab,var(--accent-fill)_28%,transparent)]",
].join(" ");

const G_PRIMARY_PRESSED =
  "shadow-[inset_0_2px_8px_rgba(0,0,0,0.5),0_0_0_1px_color-mix(in_oklab,var(--accent-fill)_8%,transparent)] brightness-90";

const G_SECONDARY_BASE = [
  "border-[var(--d-edge)] text-zinc-200",
  "bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))]",
  "shadow-[var(--d-lift)]",
  "hover:border-[var(--d-edge-hi)] hover:text-zinc-50",
  "hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.03))]",
  "[&_svg]:text-zinc-400",
].join(" ");

const G_DANGER_BASE = [
  "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] text-accent-text",
  "bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.008))]",
  "shadow-[var(--d-lift),0_0_14px_color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
  "hover:border-[color-mix(in_oklab,var(--accent-fill)_70%,transparent)]",
  "hover:bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)]",
  "[&_svg]:text-accent-text",
].join(" ");

export function GButton({
  tone = "secondary",
  size = "md",
  loading = false,
  look = "default",
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "danger" | "ghost";
  size?: "md" | "sm" | "icon";
  loading?: boolean;
  look?: "default" | "hover" | "active";
}) {
  return (
    <button
      type="button"
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium",
        "transition-[background-color,border-color,box-shadow,color,transform] duration-150 motion-reduce:transition-none",
        size === "md" && "h-9 px-3.5 text-[13px] [&_svg]:size-4",
        size === "sm" && "h-8 px-3 text-xs [&_svg]:size-3.5",
        size === "icon" && "size-9 [&_svg]:size-4",
        FOCUS,
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        G_TONE_BASE,
        tone === "primary" && G_PRIMARY_BASE,
        tone === "primary" &&
          look === "default" &&
          "hover:border-[color-mix(in_oklab,var(--accent-fill)_85%,transparent)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_4px_22px_color-mix(in_oklab,var(--accent-fill)_22%,transparent)]",
        tone === "primary" && look === "hover" && G_PRIMARY_LIT,
        tone === "primary" && look === "active" && cn(G_PRIMARY_BASE, G_PRIMARY_PRESSED),
        tone === "secondary" && G_SECONDARY_BASE,
        tone === "secondary" && look !== "default" && "border-[var(--d-edge-hi)] text-zinc-50",
        tone === "danger" && G_DANGER_BASE,
        tone === "ghost" &&
          "border-transparent text-zinc-400 shadow-none hover:border-[var(--d-edge)] hover:bg-white/[0.04] hover:text-zinc-100 [&_svg]:text-zinc-500",
        disabled &&
          !loading &&
          "disabled:pointer-events-none disabled:translate-y-0 disabled:scale-100 disabled:border-[var(--d-edge-hi)] disabled:bg-[var(--d-well)] disabled:text-zinc-400 disabled:shadow-[var(--d-sink)] disabled:[&_svg]:text-zinc-400",
        loading && "disabled:pointer-events-none disabled:cursor-wait",
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin motion-reduce:[animation:none]" /> : null}
      {children}
    </button>
  );
}

export function GIconButton({
  label,
  tone = "secondary",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: "secondary" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-lg border [&_svg]:size-[18px]",
        "transition-[background-color,border-color,box-shadow,color,transform] duration-150 motion-reduce:transition-none",
        // Glyph pops on hover; the whole tile squashes on press.
        "motion-safe:hover:-translate-y-px motion-safe:active:translate-y-px motion-safe:active:scale-[0.94]",
        "motion-safe:hover:[&_svg]:scale-110 [&_svg]:transition-transform [&_svg]:duration-150 motion-reduce:[&_svg]:transition-none",
        FOCUS,
        tone === "secondary" && cn(G_SECONDARY_BASE, "[&_svg]:text-zinc-300"),
        tone === "danger" && G_DANGER_BASE,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Switch / checkbox / radio. Same 40px track and tile geometry as D; the
// thumb travels on a spring curve, the check draws in, the radio dot pops.
// ---------------------------------------------------------------------------

export function GSwitch({
  checked = false,
  onCheckedChange,
  label,
}: {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange?.(!checked)}
      className="grid h-7 w-11 shrink-0 place-items-center outline-none"
    >
      <span
        className={cn(
          "relative h-[22px] w-[40px] rounded-full border shadow-[var(--d-sink)]",
          "transition-[background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none",
          checked
            ? "border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_55%,transparent),color-mix(in_oklab,var(--accent-fill)_32%,transparent))] shadow-[var(--d-sink),0_0_16px_color-mix(in_oklab,var(--accent-fill)_22%,transparent)]"
            : "border-[var(--d-edge-hi)] bg-[var(--d-well)]",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 size-[16px] -translate-y-1/2 rounded-full",
            "bg-[linear-gradient(180deg,#ffffff,#d4d4d8)] shadow-[0_1px_3px_rgba(0,0,0,0.6)]",
            "transition-[left] duration-200 motion-reduce:transition-none",
            "motion-safe:[transition-timing-function:cubic-bezier(0.34,1.4,0.64,1)]",
            checked ? "left-[21px]" : "left-[3px] bg-[linear-gradient(180deg,#e4e4e7,#a1a1aa)]",
          )}
        />
      </span>
    </button>
  );
}

export function GCheckbox({
  checked = false,
  onChange,
  label,
}: {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-zinc-300">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        aria-label={label}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span
        aria-hidden
        // Remount on toggle replays the pop; the input above stays mounted so
        // focus is never lost.
        key={String(checked)}
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-[5px] border text-transparent",
          "border-[var(--d-edge-hi)] bg-[var(--d-well)] shadow-[var(--d-sink)]",
          "transition-[background-color,border-color,color,box-shadow] duration-150",
          "motion-safe:[animation:g-pop_0.22s_ease-out] motion-reduce:[animation:none]",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#0a0a0e]",
          checked &&
            "border-[color-mix(in_oklab,var(--accent-fill)_65%,transparent)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_60%,transparent),color-mix(in_oklab,var(--accent-fill)_35%,transparent))] text-white shadow-[0_0_14px_color-mix(in_oklab,var(--accent-fill)_20%,transparent)]",
          "[&_svg]:size-3",
        )}
      >
        {checked ? (
          <svg
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path
              d="M2.5 6.2 5 8.5 9.5 3.5"
              className="motion-safe:[stroke-dasharray:12] motion-safe:[animation:g-draw_0.18s_ease-out_0.05s_both] motion-reduce:[animation:none]"
            />
          </svg>
        ) : null}
      </span>
      <span className="select-none">{label}</span>
    </label>
  );
}

export function GRadio({
  checked = false,
  onChange,
  label,
  name,
}: {
  checked?: boolean;
  onChange?: () => void;
  label: string;
  name: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-zinc-300">
      <input
        type="radio"
        className="peer sr-only"
        name={name}
        checked={checked}
        aria-label={label}
        onChange={onChange}
      />
      <span
        aria-hidden
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-full border",
          "border-[var(--d-edge-hi)] bg-[var(--d-well)] shadow-[var(--d-sink)]",
          "transition-[border-color,box-shadow,transform] duration-150",
          "motion-safe:active:scale-90",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#0a0a0e]",
          checked &&
            "border-[color-mix(in_oklab,var(--accent-fill)_70%,transparent)] shadow-[var(--d-sink),0_0_14px_color-mix(in_oklab,var(--accent-fill)_22%,transparent)]",
        )}
      >
        {checked ? (
          <span
            key="on"
            className="size-[8px] rounded-full bg-accent-fill motion-safe:[animation:g-pop_0.22s_ease-out] motion-reduce:[animation:none]"
          />
        ) : null}
      </span>
      <span className="select-none">{label}</span>
    </label>
  );
}

/** Progress with an eased fill and a looping shimmer. Same D construction. */
export function GProgress({
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
            className="absolute inset-y-0 w-1/2 bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.35),transparent)] [animation:g-shimmer_2.4s_ease-in-out_infinite] motion-reduce:[animation:none]"
          />
        </div>
      </div>
      <p className="mt-2.5 font-mono text-[11px] text-zinc-500">{bottom}</p>
    </div>
  );
}
