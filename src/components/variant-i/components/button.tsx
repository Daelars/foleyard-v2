"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0e]";

// Same acrylic tones as the D kit. Motion enters through the shared base:
// hover lifts a pixel, press squashes to 0.97 with the sink shadow.
const TONE_BASE =
  "motion-safe:hover:-translate-y-px motion-safe:active:translate-y-px motion-safe:active:scale-[0.97]";

const PRIMARY_BASE = [
  "border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] text-white",
  "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_36%,transparent),color-mix(in_oklab,var(--accent-fill)_20%,transparent))]",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_0_1px_color-mix(in_oklab,var(--accent-fill)_8%,transparent),0_4px_18px_color-mix(in_oklab,var(--accent-fill)_14%,transparent)]",
  "[&_svg]:text-white",
].join(" ");

const PRIMARY_LIT = [
  "border-[color-mix(in_oklab,var(--accent-fill)_90%,transparent)]",
  "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_48%,transparent),color-mix(in_oklab,var(--accent-fill)_30%,transparent))]",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_color-mix(in_oklab,var(--accent-fill)_12%,transparent),0_4px_26px_color-mix(in_oklab,var(--accent-fill)_28%,transparent)]",
].join(" ");

const PRIMARY_PRESSED =
  "shadow-[inset_0_2px_8px_rgba(0,0,0,0.5),0_0_0_1px_color-mix(in_oklab,var(--accent-fill)_8%,transparent)] brightness-90";

const SECONDARY_BASE = [
  "border-[var(--vi-edge)] text-zinc-200",
  "bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))]",
  "shadow-[var(--vi-lift)]",
  "hover:border-[var(--vi-edge-hi)] hover:text-zinc-50",
  "hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.03))]",
  "[&_svg]:text-zinc-400",
].join(" ");

const DANGER_BASE = [
  "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] text-accent-text",
  "bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.008))]",
  "shadow-[var(--vi-lift),0_0_14px_color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
  "hover:border-[color-mix(in_oklab,var(--accent-fill)_70%,transparent)]",
  "hover:bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)]",
  "[&_svg]:text-accent-text",
].join(" ");

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "danger" | "ghost";
  size?: "md" | "sm" | "icon";
  loading?: boolean;
  look?: "default" | "hover" | "active";
};

export type ButtonTone = ButtonProps["tone"];
export type ButtonSize = ButtonProps["size"];

export function Button({
  tone = "secondary",
  size = "md",
  loading = false,
  look = "default",
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
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
        TONE_BASE,
        tone === "primary" && PRIMARY_BASE,
        tone === "primary" &&
          look === "default" &&
          "hover:border-[color-mix(in_oklab,var(--accent-fill)_85%,transparent)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_4px_22px_color-mix(in_oklab,var(--accent-fill)_22%,transparent)]",
        tone === "primary" && look === "hover" && PRIMARY_LIT,
        tone === "primary" && look === "active" && cn(PRIMARY_BASE, PRIMARY_PRESSED),
        tone === "secondary" && SECONDARY_BASE,
        tone === "secondary" && look !== "default" && "border-[var(--vi-edge-hi)] text-zinc-50",
        tone === "danger" && DANGER_BASE,
        tone === "ghost" &&
          "border-transparent text-zinc-400 shadow-none hover:border-[var(--vi-edge)] hover:bg-white/[0.04] hover:text-zinc-100 [&_svg]:text-zinc-500",
        disabled &&
          !loading &&
          "disabled:pointer-events-none disabled:translate-y-0 disabled:scale-100 disabled:border-[var(--vi-edge-hi)] disabled:bg-[var(--vi-well)] disabled:text-zinc-400 disabled:shadow-[var(--vi-sink)] disabled:[&_svg]:text-zinc-400",
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

export function IconButton({
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
        tone === "secondary" && cn(SECONDARY_BASE, "[&_svg]:text-zinc-300"),
        tone === "danger" && DANGER_BASE,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * The transport play/pause button: red-lit glass disc with a glow that
 * strengthens while playing, and a glyph pop on change.
 */
export function PlayButton({
  playing,
  label,
  onClick,
}: {
  playing: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={[
        "grid size-11 shrink-0 place-items-center rounded-full text-white outline-none",
        "bg-[linear-gradient(180deg,var(--accent-fill-hover),var(--accent-fill))]",
        "transition-[box-shadow,transform,filter] duration-150",
        "hover:brightness-110 motion-safe:hover:-translate-y-px motion-safe:active:scale-95",
        "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0e] motion-reduce:transition-none [&_svg]:size-[18px]",
        playing
          ? "shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_34px_color-mix(in_oklab,var(--accent-fill)_55%,transparent)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_42px_color-mix(in_oklab,var(--accent-fill)_65%,transparent)]"
          : "shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_22px_color-mix(in_oklab,var(--accent-fill)_35%,transparent)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_0_30px_color-mix(in_oklab,var(--accent-fill)_50%,transparent)]",
      ].join(" ")}
    >
      {playing ? (
        <PauseGlyph />
      ) : (
        <PlayGlyph />
      )}
    </button>
  );
}

function PauseGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="motion-safe:[animation:vi-pop_0.18s_ease-out] motion-reduce:[animation:none]"
    >
      <rect x="14" y="4" width="4" height="16" rx="1" />
      <rect x="6" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="ml-0.5 motion-safe:[animation:vi-pop_0.18s_ease-out] motion-reduce:[animation:none]"
    >
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

export type { ReactNode };