// PROTOTYPE ONLY — variant D kit, "Mockup match".
//
// Local throwaway primitives styled to the supplied reference mockup:
// near-black canvas, dark restrained cards with a faint red ambient bloom,
// red-tinted acrylic primary, charcoal glass secondaries, inset fields,
// teal/amber/gray/red status badges, dark tags with a red AI score.
// Coral resolves from the ratified theme layer (`--accent-fill`) via
// color-mix — no hard-coded accent hex in this file.

"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
} from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const D_TOKENS = {
  "--d-well": "rgba(0, 0, 0, 0.42)",
  "--d-edge": "rgba(255, 255, 255, 0.09)",
  "--d-edge-hi": "rgba(255, 255, 255, 0.16)",
  "--d-lift": "inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.4)",
  "--d-sink": "inset 0 1px 3px rgba(0, 0, 0, 0.55)",
} as React.CSSProperties;

export function DSurface({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div style={D_TOKENS} className={className}>
      {children}
    </div>
  );
}

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0e]";

// ---------------------------------------------------------------------------
// Card — very dark, hairline edge, faint red ambient bloom at one corner.
// ---------------------------------------------------------------------------

export function DCard({
  title,
  sub,
  glow = "none",
  className,
  children,
}: {
  title: string;
  sub: string;
  glow?: "none" | "tl" | "tr" | "bl" | "br";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-xl border border-[var(--d-edge)] bg-white/[0.02] p-4",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_8px_28px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      {glow !== "none" ? (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute size-44 rounded-full blur-3xl",
            "bg-[color-mix(in_oklab,var(--accent-fill)_9%,transparent)]",
            glow === "tl" && "-left-16 -top-16",
            glow === "tr" && "-right-16 -top-16",
            glow === "bl" && "-bottom-16 -left-16",
            glow === "br" && "-bottom-16 -right-16",
          )}
        />
      ) : null}
      <div className="relative">
        <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
        <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>
        <div className="mt-3">{children}</div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Buttons — shared acrylic base; primary is red-lit glass, secondary is
// charcoal glass, danger keeps the dark body and speaks through red
// text/edge. `look` pins the hover/active appearance for the states card.
// ---------------------------------------------------------------------------

const D_PRIMARY_BASE = [
  "border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] text-white",
  "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_36%,transparent),color-mix(in_oklab,var(--accent-fill)_20%,transparent))]",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_0_1px_color-mix(in_oklab,var(--accent-fill)_8%,transparent),0_4px_18px_color-mix(in_oklab,var(--accent-fill)_14%,transparent)]",
  "[&_svg]:text-white",
].join(" ");

const D_PRIMARY_LIT = [
  "border-[color-mix(in_oklab,var(--accent-fill)_90%,transparent)]",
  "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_48%,transparent),color-mix(in_oklab,var(--accent-fill)_30%,transparent))]",
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_0_1px_color-mix(in_oklab,var(--accent-fill)_12%,transparent),0_4px_26px_color-mix(in_oklab,var(--accent-fill)_28%,transparent)]",
].join(" ");

const D_PRIMARY_PRESSED =
  "shadow-[inset_0_2px_8px_rgba(0,0,0,0.5),0_0_0_1px_color-mix(in_oklab,var(--accent-fill)_8%,transparent)] brightness-90";

const D_SECONDARY_BASE = [
  "border-[var(--d-edge)] text-zinc-200",
  "bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.018))]",
  "shadow-[var(--d-lift)]",
  "hover:border-[var(--d-edge-hi)] hover:text-zinc-50",
  "hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.03))]",
  "[&_svg]:text-zinc-400",
].join(" ");

const D_DANGER_BASE = [
  "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] text-accent-text",
  "bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.008))]",
  "shadow-[var(--d-lift),0_0_14px_color-mix(in_oklab,var(--accent-fill)_8%,transparent)]",
  "hover:border-[color-mix(in_oklab,var(--accent-fill)_70%,transparent)]",
  "hover:bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)]",
  "[&_svg]:text-accent-text",
].join(" ");

export function DButton({
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
  const busy = loading || disabled;
  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium",
        "transition-[background-color,border-color,box-shadow,color,transform] duration-150 motion-reduce:transition-none",
        size === "md" && "h-9 px-3.5 text-[13px] [&_svg]:size-4",
        size === "sm" && "h-8 px-3 text-xs [&_svg]:size-3.5",
        size === "icon" && "size-9 [&_svg]:size-4",
        FOCUS,
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        tone === "primary" && D_PRIMARY_BASE,
        tone === "primary" &&
          look === "default" &&
          "hover:border-[color-mix(in_oklab,var(--accent-fill)_85%,transparent)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_4px_22px_color-mix(in_oklab,var(--accent-fill)_22%,transparent)] active:translate-y-px",
        tone === "primary" && look === "hover" && D_PRIMARY_LIT,
        tone === "primary" && look === "active" && cn(D_PRIMARY_BASE, D_PRIMARY_PRESSED),
        tone === "secondary" && D_SECONDARY_BASE,
        tone === "secondary" && look !== "default" && "border-[var(--d-edge-hi)] text-zinc-50",
        tone === "danger" && D_DANGER_BASE,
        tone === "ghost" &&
          "border-transparent text-zinc-400 shadow-none hover:border-[var(--d-edge)] hover:bg-white/[0.04] hover:text-zinc-100 [&_svg]:text-zinc-500",
        // Inactive stays legible: a sunken well with a visible edge and a
        // zinc-400 label (~7:1 on the canvas) instead of zinc-600 debris.
        // "Off" reads through shape — no glow, no highlight, gray not white —
        // never through near-invisible text.
        disabled &&
          !loading &&
          "disabled:pointer-events-none disabled:border-[var(--d-edge-hi)] disabled:bg-[var(--d-well)] disabled:text-zinc-400 disabled:shadow-[var(--d-sink)] disabled:[&_svg]:text-zinc-400",
        // Loading keeps the tone's full-contrast surface (primary tint, white
        // label) with a wait cursor: it is busy, not gone. Still disabled in
        // the DOM so a second click cannot double-submit; aria-busy above
        // exposes the state to assistive tech.
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

export function DIconButton({
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
        "active:translate-y-px active:shadow-[var(--d-sink)]",
        FOCUS,
        tone === "secondary" && cn(D_SECONDARY_BASE, "[&_svg]:text-zinc-300"),
        tone === "danger" && D_DANGER_BASE,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Fields — inset wells, darker than buttons. Error carries a red edge, red
// tint, and red-tinted text like the mockup.
// ---------------------------------------------------------------------------

export function DField({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-[var(--d-edge)] bg-[var(--d-well)] px-3 text-[13px] text-zinc-100",
        "shadow-[var(--d-sink)] outline-none placeholder:text-zinc-600",
        "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
        "hover:border-[var(--d-edge-hi)]",
        "focus:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] focus:shadow-[var(--d-sink),0_0_16px_color-mix(in_oklab,var(--accent-fill)_10%,transparent)]",
        "aria-[invalid=true]:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] aria-[invalid=true]:bg-[color-mix(in_oklab,var(--accent-fill)_9%,rgba(0,0,0,0.42))] aria-[invalid=true]:text-accent-text aria-[invalid=true]:placeholder:text-accent-text/60",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

export function DSelect({
  label,
  value,
  onChange,
  options,
  className,
  menuClassName,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  className?: string;
  /** Extra classes for the floating menu (e.g. an open animation). */
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(() =>
    Math.max(0, options.findIndex((option) => option.value === value)),
  );
  // Viewport-fixed menu geometry, measured from the trigger on open and on
  // every scroll/resize. The menu is NOT absolutely positioned inside the
  // card: cards use overflow-hidden for their corner bloom, which would clip
  // an in-card menu to invisibility.
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const needed = Math.min(options.length * 36 + 8, 208);
    const below = window.innerHeight - rect.bottom - 8;
    const opensUp = below < needed && rect.top - 8 > below;
    setMenuPos(
      opensUp
        ? { bottom: window.innerHeight - rect.top + 6, left: rect.left, width: rect.width }
        : { top: rect.bottom + 6, left: rect.left, width: rect.width },
    );
  }, [options.length]);

  const openMenu = () => {
    setHighlight(Math.max(0, options.findIndex((option) => option.value === value)));
    measure();
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    measure();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onReposition = () => measure();
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, measure]);

  const pick = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange?.(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openMenu();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) openMenu();
          }
        }}
        className={cn(
          "flex h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-[var(--d-edge)] bg-[var(--d-well)] px-3 text-left text-[13px] text-zinc-200",
          "shadow-[var(--d-sink)] outline-none transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
          "hover:border-[var(--d-edge-hi)]",
          "focus-visible:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)]",
          open && "border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)]",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-zinc-500 transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>

      {open && menuPos ? (
        <div
          ref={menuRef}
          style={{
            top: menuPos.top,
            bottom: menuPos.bottom,
            left: menuPos.left,
            width: menuPos.width,
          }}
          className={cn(
            "fixed z-[70] overflow-hidden rounded-lg border border-[var(--d-edge-hi)] bg-[#141419] p-1 shadow-[0_16px_44px_rgba(0,0,0,0.65),0_0_24px_color-mix(in_oklab,var(--accent-fill)_6%,transparent)]",
            menuClassName,
          )}
        >
          <div
            id={listId}
            role="listbox"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setHighlight((index) => (index + 1) % options.length);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setHighlight((index) => (index - 1 + options.length) % options.length);
              } else if (event.key === "Enter") {
                event.preventDefault();
                pick(highlight);
              } else if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                triggerRef.current?.focus();
              }
            }}
            className="grid max-h-[208px] gap-0.5 overflow-y-auto outline-none"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              const isHighlighted = index === highlight;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={-1}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => pick(index)}
                  className={cn(
                    // Same selection language as the command rows: red tint
                    // AND red edge AND faint glow, never tint alone.
                    "flex h-9 w-full items-center gap-2 rounded-md border px-2.5 text-left text-[13px] transition-colors duration-100",
                    isSelected
                      ? "border-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_13%,transparent)] text-zinc-50 shadow-[0_0_18px_color-mix(in_oklab,var(--accent-fill)_12%,transparent)]"
                      : "border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
                    !isSelected &&
                      isHighlighted &&
                      "bg-white/[0.04] text-zinc-100",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {isSelected ? (
                    <Check aria-hidden className="size-3.5 shrink-0 text-accent-text" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function DKbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--d-edge-hi)] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 shadow-[var(--d-lift)] [&_svg]:size-3">
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Switch / checkbox / radio — compact glass; on-ness is red track + glow,
// never colour alone (thumb travels too).
// ---------------------------------------------------------------------------

export function DSwitch({
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
            // Explicit left stops: thumb travel is bounded inside the 40px
            // track (3px … 21px + 16px thumb = 37px), so it can never escape
            // over the label. `left` transitions; it never shares the
            // `translate` property with the vertical centering.
            "absolute top-1/2 size-[16px] -translate-y-1/2 rounded-full",
            "bg-[linear-gradient(180deg,#ffffff,#d4d4d8)] shadow-[0_1px_3px_rgba(0,0,0,0.6)]",
            "transition-[left] duration-150 motion-reduce:transition-none",
            checked ? "left-[21px]" : "left-[3px] bg-[linear-gradient(180deg,#e4e4e7,#a1a1aa)]",
          )}
        />
      </span>
    </button>
  );
}

export function DCheckbox({
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
        className={cn(
          "grid size-[18px] shrink-0 place-items-center rounded-[5px] border text-transparent",
          "border-[var(--d-edge-hi)] bg-[var(--d-well)] shadow-[var(--d-sink)]",
          "transition-[background-color,border-color,color,box-shadow] duration-150",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#0a0a0e]",
          "peer-checked:border-[color-mix(in_oklab,var(--accent-fill)_65%,transparent)] peer-checked:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_60%,transparent),color-mix(in_oklab,var(--accent-fill)_35%,transparent))] peer-checked:text-white peer-checked:shadow-[0_0_14px_color-mix(in_oklab,var(--accent-fill)_20%,transparent)]",
          "[&_svg]:size-3",
        )}
      >
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2.5 6.2 5 8.5 9.5 3.5" />
        </svg>
      </span>
      <span className="select-none">{label}</span>
    </label>
  );
}

export function DRadio({
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
          "transition-[border-color,box-shadow] duration-150",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#0a0a0e]",
          checked &&
            "border-[color-mix(in_oklab,var(--accent-fill)_70%,transparent)] shadow-[var(--d-sink),0_0_14px_color-mix(in_oklab,var(--accent-fill)_22%,transparent)]",
        )}
      >
        <span
          className={cn(
            "size-[8px] rounded-full transition-opacity duration-150",
            checked ? "bg-accent-fill opacity-100" : "opacity-0",
          )}
        />
      </span>
      <span className="select-none">{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Badges / tags — one tiny LED construction per status; tags are dark
// capsules; the AI score gets the strong red treatment.
// ---------------------------------------------------------------------------

const D_STATUS = {
  ready: "border-teal-300/30 bg-teal-300/[0.07] text-teal-200",
  processing: "border-amber-300/30 bg-amber-300/[0.07] text-amber-200",
  unavailable: "border-[var(--d-edge)] bg-white/[0.03] text-zinc-400",
  error: "border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_9%,transparent)] text-accent-text",
};

export function DStatusBadge({
  status,
  tone,
}: {
  status: string;
  tone: keyof typeof D_STATUS;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center whitespace-nowrap rounded-md border px-2.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        D_STATUS[tone],
      )}
    >
      {status}
    </span>
  );
}

export function DTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center whitespace-nowrap rounded-md border border-[var(--d-edge)] bg-white/[0.03] px-2.5 font-mono text-xs text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {children}
    </span>
  );
}

export function DAIScore({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center whitespace-nowrap rounded-md border border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_10%,transparent)] px-2.5 font-mono text-xs font-medium text-accent-text shadow-[0_0_14px_color-mix(in_oklab,var(--accent-fill)_10%,transparent)]">
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Command panel — dark floating surface; selected row is a red-tinted band
// with an edge, idle rows show right-aligned hints.
// ---------------------------------------------------------------------------

export function DCommandPanel({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--d-edge-hi)] bg-[#101014]/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_16px_44px_rgba(0,0,0,0.6)]">
      {children}
    </div>
  );
}

export function DCommandRow({
  active = false,
  hint,
  icon,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  hint?: string;
  icon?: ReactNode;
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
        <DKbd>↵</DKbd>
      ) : hint ? (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-600">
          {hint}
        </span>
      ) : null}
    </button>
  );
}

/** Section header grouping palette rows (view / sound / tool …). */
export function DCommandSection({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-600 first:pt-1">
      {children}
    </p>
  );
}

/** Shortcut footer: navigate / run / close affordances plus result count. */
export function DCommandFooter({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-4 border-t border-white/[0.07] px-4 py-2.5 font-mono text-[10px] text-zinc-600">
      <span className="flex items-center gap-1.5">
        <DKbd>↑↓</DKbd> navigate
      </span>
      <span className="flex items-center gap-1.5">
        <DKbd>↵</DKbd> run
      </span>
      <span className="flex items-center gap-1.5">
        <DKbd>esc</DKbd> close
      </span>
      <span className="flex-1" />
      <span>
        {count} command{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts / progress / pagination / tooltip.
// ---------------------------------------------------------------------------

export function DAlert({
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

export function DProgress({
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
          className="h-full rounded-full bg-accent-fill shadow-[0_0_12px_color-mix(in_oklab,var(--accent-fill)_40%,transparent)]"
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      <p className="mt-2.5 font-mono text-[11px] text-zinc-500">{bottom}</p>
    </div>
  );
}

export function DPageButton({
  active = false,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; label: string }) {
  return (
    <button
      type="button"
      aria-label={`Page ${label}`}
      aria-current={active || undefined}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md border font-mono text-xs transition-colors duration-150",
        FOCUS,
        active
          ? "border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_14%,transparent)] text-accent-text shadow-[0_0_14px_color-mix(in_oklab,var(--accent-fill)_12%,transparent)]"
          : "border-[var(--d-edge)] bg-white/[0.02] text-zinc-400 hover:border-[var(--d-edge-hi)] hover:text-zinc-100",
      )}
      {...props}
    >
      {label}
    </button>
  );
}

export function DTooltipBubble({ children }: { children: ReactNode }) {
  return (
    <span className="relative mb-2.5 rounded-md border border-[var(--d-edge-hi)] bg-[#17171c] px-2.5 py-1.5 text-xs text-zinc-200 shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
      {children}
      <span
        aria-hidden
        className="absolute -bottom-[5px] left-1/2 size-2 -translate-x-1/2 rotate-45 border-b border-r border-[var(--d-edge-hi)] bg-[#17171c]"
      />
      <span aria-hidden className="absolute -bottom-[7px] left-1/2 size-1 -translate-x-1/2 rounded-full bg-zinc-500" />
    </span>
  );
}
