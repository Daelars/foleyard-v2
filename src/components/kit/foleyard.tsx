"use client";

import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { Loader2 } from "lucide-react";
import type { TagOrigin } from "@yard-core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/kit/button";
import { Kbd } from "@/components/kit/kbd";
import { Switch } from "@/components/kit/switch";
import { TagOriginMark } from "@/components/workspace/FileTable/tag-origin-mark";

/**
 * Literal sound metadata attached to a file. Its own component, not `Badge`
 * with a className, because it is a different object: a tag carries a machine
 * string, sometimes a provenance mark, and a selection state.
 *
 * Variant I's tag: 28px, `rounded-md`, mono, a hairline edge over a barely
 * lit fill with a 1px top highlight. Mono because the name is a literal
 * string a person typed or a rule produced, not prose.
 *
 * Selected is an accent edge, an accent tint and a glow — the same treatment
 * the active palette row and the current page button use, so "this is the one
 * you are on" is one idea with one appearance across the app. It is a tint
 * rather than a solid fill, which is what stops the current tag reading as
 * "important" beside its neutral neighbours.
 */
export function SoundTag({
  name,
  selected = false,
  provenance,
  confidence,
  onClick,
  className,
}: {
  name: string;
  selected?: boolean;
  provenance?: TagOrigin | null;
  confidence?: number | null;
  onClick?: () => void;
  className?: string;
}) {
  const interactive = typeof onClick === "function";
  const body = (
    <>
      <span aria-hidden className={selected ? "text-accent-text/60" : "text-zinc-600"}>
        #
      </span>
      <span className="truncate">{name}</span>
      {provenance ? (
        <>
          <span aria-hidden className="h-3 w-px shrink-0 bg-edge" />
          <TagOriginMark origin={provenance} confidence={confidence} />
        </>
      ) : null}
    </>
  );

  const shape = cn(
    "inline-flex h-7 max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap",
    "rounded-md border px-2.5 font-mono text-xs",
    "transition-[background-color,border-color,box-shadow,color] duration-150 motion-reduce:transition-none",
    selected
      ? "border-edge-accent bg-[color-mix(in_oklab,var(--accent-fill)_13%,transparent)] text-accent-text shadow-[0_0_14px_color-mix(in_oklab,var(--accent-fill)_12%,transparent)]"
      : "border-edge bg-white/[0.03] text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
    interactive &&
      "cursor-pointer hover:border-edge-hover hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
    className,
  );

  if (!interactive) {
    return <span className={shape}>{body}</span>;
  }
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className={shape}>
      {body}
    </button>
  );
}

// Variant I's status tones. Teal for ready, amber for in-flight, neutral for
// unavailable, accent for error — deliberately not the tag's palette, so a
// state and a tag are never confused even though both are 28px chips.
const STATUS_TONE = {
  neutral: "border-edge bg-white/[0.03] text-zinc-400",
  ready: "border-teal-300/30 bg-teal-300/[0.07] text-teal-200",
  processing: "border-amber-300/30 bg-amber-300/[0.07] text-amber-200",
  warning: "border-amber-300/30 bg-amber-300/[0.07] text-amber-200",
  unavailable: "border-edge bg-white/[0.03] text-zinc-400",
  error:
    "border-edge-accent-soft bg-[color-mix(in_oklab,var(--accent-fill)_9%,transparent)] text-accent-text",
} as const;

/**
 * Names a workflow state. Same 28px chip as a tag but in mono small-caps with
 * its own tone palette, so the two are distinguishable by colour family and
 * by letterform rather than by shape. The state is carried by the word, so it
 * survives without colour.
 */
export function StatusBadge({
  status,
  tone = "neutral",
  className,
}: {
  status: string;
  tone?: keyof typeof STATUS_TONE;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-md border px-2.5",
        "font-mono text-[10.5px] font-medium uppercase tracking-[0.06em]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        STATUS_TONE[tone] ?? STATUS_TONE.neutral,
        className,
      )}
    >
      {status}
    </span>
  );
}

/**
 * A labelled row that owns a control. Designed as a row rather than assembled
 * from divs: the control aligns to the label's first line instead of the row's
 * centre, so a two-line description does not drag the switch downwards and out
 * of line with its neighbours in a stack of settings.
 */
export function SettingRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  children,
  className,
}: {
  label: string;
  description?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-16 items-start gap-4 border-b border-edge px-4 py-3.5 last:border-0",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-7 font-medium text-zinc-100">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{description}</p>
        ) : null}
      </div>
      {/* h-7 matches the label's line box and the switch's hit area, so the
          control sits on the label's first line rather than the row's centre. */}
      <div className="flex h-7 shrink-0 items-center">
        {children ?? (
          <Switch
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            aria-label={label}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Async action that keeps its label while busy. Stays disabled so a second
 * click cannot double-submit, and keeps `aria-busy`.
 *
 * Variant I's rule for this state is that busy is not the same as off: the
 * button keeps its tone's full-contrast surface and its white label and shows
 * a wait cursor, rather than falling back to the disabled well. It is busy,
 * not gone.
 */
export function PendingButton({
  pending = false,
  pendingText,
  children,
  disabled,
  className,
  ...props
}: React.ComponentProps<typeof Button> & {
  pending?: boolean;
  pendingText?: ReactNode;
}) {
  return (
    <Button
      disabled={disabled ?? pending}
      aria-busy={pending || undefined}
      data-busy={pending || undefined}
      className={cn(
        pending &&
          "disabled:cursor-wait disabled:border-edge-accent disabled:bg-[image:var(--mat-accent)] disabled:text-white disabled:shadow-elev-accent disabled:[&_svg]:text-white",
        className,
      )}
      {...props}
    >
      {pending ? (
        <Loader2 className="animate-spin motion-reduce:[animation:none]" data-icon="inline-start" />
      ) : null}
      {pending && pendingText !== undefined ? pendingText : children}
    </Button>
  );
}

/**
 * Command-palette row. Visual treatment only: the parent owns entry data,
 * filtering, keyboard navigation and execution, and passes through listbox
 * semantics (`role`, `aria-selected`, `id`).
 *
 * Variant I's row: 36px, `rounded-md`, and active is a red-tinted band with
 * an accent edge and a glow, carrying an ↵ key on the trailing edge. Idle
 * rows are transparent with a right-aligned mono hint and only tint on hover,
 * so pointer position and keyboard position stay distinguishable.
 */
export function CommandItem({
  active = false,
  hint,
  icon,
  children,
  className,
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  hint?: ReactNode;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex h-9 w-full items-center gap-3 rounded-md border px-3 text-left text-[13px]",
        "transition-colors duration-150 motion-reduce:transition-none",
        active
          ? "border-edge-accent bg-[color-mix(in_oklab,var(--accent-fill)_13%,transparent)] text-zinc-50 shadow-[0_0_18px_color-mix(in_oklab,var(--accent-fill)_12%,transparent)]"
          : "border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
        className,
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
