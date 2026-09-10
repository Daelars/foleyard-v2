// PROTOTYPE ONLY — variant B control set, "Console".
//
// These are local throwaway components, deliberately NOT the shared ones in
// `src/components/ui`, so variant A keeps rendering the shipped design and the
// two can be compared on the same screen. If B wins, these get rewritten
// properly into the shared components (see
// docs/component-library-agent-prompt-redesign.md).
//
// The direction: controls are built as machined parts rather than tinted
// rectangles. Two material levels do all the work — a WELL (recessed, darker
// than the canvas, inner shadow) for anything that holds or receives content,
// and a KEY (raised, lighter, 1px top highlight, drop shadow) for anything you
// press. Every control is one or the other, which is what makes them read as a
// family. Coral lights a key from within or marks an edge; it never becomes a
// solid orange block.
"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from "react";
import type { TagOrigin } from "@yard-core";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Material system. Defined once, here, so no component invents its own
// opacities. Radius steps with size: chip 4, control 6, panel 10.
// ---------------------------------------------------------------------------

const CONSOLE_TOKENS = {
  "--b-well": "rgba(0, 0, 0, 0.34)",
  "--b-key": "rgba(255, 255, 255, 0.05)",
  "--b-key-hi": "rgba(255, 255, 255, 0.085)",
  "--b-edge": "rgba(255, 255, 255, 0.09)",
  "--b-edge-hi": "rgba(255, 255, 255, 0.17)",
  "--b-top": "rgba(255, 255, 255, 0.13)",
  "--b-lift": "inset 0 1px 0 var(--b-top), 0 1px 2px rgba(0, 0, 0, 0.5)",
  "--b-sink": "inset 0 2px 3px rgba(0, 0, 0, 0.55)",
  "--b-panel": "rgba(16, 16, 20, 0.9)",
} as React.CSSProperties;

/** Root that publishes the material tokens and the one keyframe B needs. */
export function ConsoleSurface({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div style={CONSOLE_TOKENS} className={className}>
      <style>{`@keyframes b-scan { 0% { transform: translateX(-110%); } 100% { transform: translateX(340%); } }
@keyframes b-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`}</style>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key — the action. A raised key you can physically press: it moves down and
// its shadow flips from lift to sink. Primary is not a coral slab; it is the
// same key lit from inside, with the coral carried by the inner highlight, the
// edge, the underglow, and the icon. Disabled recesses into a well rather than
// fading to 45% opacity, so an unavailable action reads as switched off
// instead of as debris.
// ---------------------------------------------------------------------------

const KEY_SIZES = {
  md: "h-[30px] gap-2 px-3 text-[12.5px] [&_svg]:size-[15px]",
  sm: "h-[24px] gap-1.5 px-2.5 text-[11.5px] [&_svg]:size-[13px]",
  icon: "size-[30px] [&_svg]:size-[15px]",
  "icon-sm": "size-[24px] [&_svg]:size-[13px]",
};

const KEY_TONES = {
  primary: [
    "border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)]",
    "bg-[color-mix(in_oklab,var(--accent-fill)_16%,transparent)] text-zinc-50",
    "shadow-[inset_0_1px_0_color-mix(in_oklab,var(--accent-fill)_40%,transparent),0_1px_2px_rgba(0,0,0,0.5),0_2px_10px_color-mix(in_oklab,var(--accent-fill)_20%,transparent)]",
    "hover:border-[color-mix(in_oklab,var(--accent-fill)_72%,transparent)] hover:bg-[color-mix(in_oklab,var(--accent-fill)_24%,transparent)]",
    "active:shadow-[var(--b-sink)]",
    "[&_svg]:text-accent-text",
  ].join(" "),
  neutral: [
    "border-[var(--b-edge)] bg-[var(--b-key)] text-zinc-200 shadow-[var(--b-lift)]",
    "hover:border-[var(--b-edge-hi)] hover:bg-[var(--b-key-hi)] hover:text-zinc-50",
    "active:shadow-[var(--b-sink)]",
    "[&_svg]:text-zinc-400 hover:[&_svg]:text-zinc-200",
  ].join(" "),
  quiet: [
    "border-transparent bg-transparent text-zinc-400 shadow-none",
    "hover:border-[var(--b-edge)] hover:bg-[var(--b-key)] hover:text-zinc-100",
    "[&_svg]:text-zinc-500 hover:[&_svg]:text-zinc-200",
  ].join(" "),
  danger: [
    "border-destructive/45 bg-destructive/[0.12] text-destructive shadow-[var(--b-lift)]",
    "hover:border-destructive/70 hover:bg-destructive/20",
    "active:shadow-[var(--b-sink)]",
  ].join(" "),
};

export function Key({
  tone = "neutral",
  size = "md",
  pending = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: keyof typeof KEY_TONES;
  size?: keyof typeof KEY_SIZES;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled ?? pending}
      aria-busy={pending || undefined}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden whitespace-nowrap rounded-[6px] border font-medium outline-none",
        "transition-[background-color,border-color,box-shadow,color,transform] duration-[120ms] motion-reduce:transition-none",
        "active:translate-y-px",
        "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        KEY_SIZES[size],
        KEY_TONES[tone],
        // Unavailable = recessed, not faded.
        "disabled:pointer-events-none disabled:translate-y-0 disabled:border-[var(--b-edge)] disabled:bg-[var(--b-well)] disabled:text-zinc-500 disabled:shadow-[var(--b-sink)] disabled:[&_svg]:text-zinc-600",
        className,
      )}
      {...props}
    >
      {children}
      {/* Busy keeps the label and the width; the key just gets a live edge. */}
      {pending ? (
        <span
          aria-hidden
          className="absolute inset-x-[3px] bottom-[3px] h-[2px] overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--accent-fill)_16%,transparent)]"
        >
          <span className="block h-full w-1/3 rounded-full bg-accent-fill [animation:b-scan_1.1s_ease-in-out_infinite] motion-reduce:[animation:none]" />
        </span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Chip — a sound tag. A recessed slot, not a pill: tags are metadata the file
// carries, so they read as inset rather than pressable. Selection is a coral
// rail on the leading edge, so a selected tag no longer outranks its
// neighbours by being a solid orange lozenge. Provenance lives in its own
// compartment behind a hairline, so it reads as a separate field rather than
// as loose characters trailing the name.
// ---------------------------------------------------------------------------

function ProvenanceMark({ origin, confidence }: { origin: TagOrigin; confidence?: number }) {
  if (origin === "manual") {
    return (
      <span title="Added by hand" className="text-zinc-400">
        M
      </span>
    );
  }
  if (origin === "deterministic") {
    return (
      <span title="Fired by a filename rule" className="text-accent-text">
        D
      </span>
    );
  }
  return (
    <span
      title={
        confidence == null
          ? "Suggested automatically"
          : `Suggested automatically at ${confidence.toFixed(2)} confidence`
      }
      className="text-chart-3"
    >
      AI{confidence == null ? "" : ` ${confidence.toFixed(2)}`}
    </span>
  );
}

export function Chip({
  name,
  selected = false,
  provenance,
  confidence,
  onClick,
  className,
}: {
  name: string;
  selected?: boolean;
  provenance?: TagOrigin;
  confidence?: number;
  onClick?: () => void;
  className?: string;
}) {
  const interactive = Boolean(onClick);
  const Tag = interactive ? "button" : "span";

  return (
    <Tag
      {...(interactive ? { type: "button" as const, onClick } : {})}
      aria-pressed={interactive ? selected : undefined}
      className={cn(
        "relative inline-flex h-[18px] max-w-[16rem] items-stretch overflow-hidden rounded-[4px] border font-mono text-[10.5px] leading-none shadow-[var(--b-sink)]",
        "transition-[background-color,border-color,color] duration-[120ms] motion-reduce:transition-none",
        selected
          ? "border-[color-mix(in_oklab,var(--accent-fill)_38%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_11%,transparent)] text-zinc-50"
          : "border-[var(--b-edge)] bg-[var(--b-well)] text-zinc-300",
        interactive &&
          "cursor-pointer outline-none hover:border-[var(--b-edge-hi)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] focus-visible:ring-offset-1 focus-visible:ring-offset-canvas",
        className,
      )}
    >
      {selected ? (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-accent-fill" />
      ) : null}
      <span className={cn("flex min-w-0 items-center gap-px px-1.5", selected && "pl-2.5")}>
        <span className={selected ? "text-accent-text" : "text-zinc-600"}>#</span>
        <span className="truncate">{name}</span>
      </span>
      {provenance ? (
        <span className="flex items-center border-l border-[var(--b-edge)] bg-black/25 px-1 font-bold">
          <ProvenanceMark origin={provenance} confidence={confidence} />
        </span>
      ) : null}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// StatusLine — workflow state. Given no container at all, so it can never be
// mistaken for a tag. The dot is shape-coded as well as colour-coded (filled /
// ring / hollow / square), and the word carries the state on its own.
// ---------------------------------------------------------------------------

const STATUS_DOTS = {
  ready: "size-[6px] rounded-full bg-emerald-400",
  processing:
    "size-[6px] rounded-full border-[1.5px] border-amber-300 [animation:b-breathe_1.6s_ease-in-out_infinite] motion-reduce:[animation:none]",
  unavailable: "size-[6px] rounded-full border border-zinc-500",
  error: "size-[6px] rounded-[1px] bg-destructive",
};

export function StatusLine({
  status,
  tone = "unavailable",
}: {
  status: string;
  tone?: keyof typeof STATUS_DOTS;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={STATUS_DOTS[tone]} />
      <span
        className={cn(
          "font-mono text-[10px] uppercase tracking-[0.14em]",
          tone === "error" ? "text-destructive" : "text-zinc-400",
        )}
      >
        {status}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Field — text entry. A well, matching the switch track and the chip slot.
// Focus draws a coral rule hard under the field, like a lit channel strip,
// instead of a halo ring: it reads at a glance and never bleeds into
// neighbouring controls in a dense row.
// ---------------------------------------------------------------------------

export function Field({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-[30px] w-full min-w-0 rounded-[6px] border border-[var(--b-edge)] bg-[var(--b-well)] px-2.5 text-[12.5px] text-zinc-100",
        "shadow-[var(--b-sink)] outline-none placeholder:text-zinc-600",
        "transition-[border-color,box-shadow,background-color] duration-[120ms] motion-reduce:transition-none",
        "hover:border-[var(--b-edge-hi)]",
        "focus:border-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] focus:shadow-[var(--b-sink),0_1px_0_0_var(--accent-fill)]",
        "aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:shadow-[var(--b-sink),0_1px_0_0_var(--destructive)]",
        "disabled:border-transparent disabled:bg-black/25 disabled:text-zinc-600 disabled:shadow-[var(--b-sink)] disabled:placeholder:text-zinc-700",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Toggle — a switch built as a slot and a key, at hardware proportions
// (34x18 track, 14px thumb) rather than the 44x24 default. The thumb is a
// small raised key, not the brightest white object on screen. On-ness is
// carried by three things, only one of which is colour: the thumb travels, the
// track lights, and the thumb gains a coral core. Visible track is small; the
// hit area is 40x28.
// ---------------------------------------------------------------------------

export function Toggle({
  checked = false,
  onCheckedChange,
  disabled,
  label,
}: {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className="group grid h-[28px] w-[40px] shrink-0 place-items-center outline-none disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={cn(
          "relative h-[18px] w-[34px] rounded-full border shadow-[var(--b-sink)]",
          "transition-[background-color,border-color] duration-[120ms] motion-reduce:transition-none",
          "group-focus-visible:ring-2 group-focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-canvas",
          checked
            ? "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_26%,transparent)]"
            : "border-[var(--b-edge)] bg-[var(--b-well)] group-hover:border-[var(--b-edge-hi)]",
        )}
      >
        <span
          className={cn(
            "absolute left-px top-1/2 size-[14px] -translate-y-1/2 rounded-full border border-black/40 bg-zinc-300",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_1px_2px_rgba(0,0,0,0.6)]",
            "transition-transform duration-[140ms] group-active:scale-95 motion-reduce:transition-none",
            checked ? "translate-x-[16px]" : "translate-x-0",
          )}
        >
          <span
            className={cn(
              "absolute inset-[3.5px] rounded-full bg-accent-fill transition-opacity duration-[120ms] motion-reduce:transition-none",
              checked ? "opacity-100" : "opacity-0",
            )}
          />
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// SettingBand — a labelled row. The control aligns to the label's first
// baseline, not the row's vertical centre, so a two-line description does not
// drag the switch downward out of line with its own label.
// ---------------------------------------------------------------------------

export function SettingBand({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[52px] items-start gap-4 border-b border-[var(--b-edge)] px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-5 text-zinc-100">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[11.5px] leading-[1.45] text-zinc-500">{description}</p>
        ) : null}
      </div>
      <div className="flex h-5 shrink-0 items-center">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel and Band — the floating surface and its rows. The panel is squarer
// than A's and its depth comes from a real drop shadow plus a top highlight;
// the coral is a faint bloom in the shadow rather than a detached halo behind
// an opaque card. Rows are full-bleed bands with a coral leading rail when
// active — no capsule outline — and section headers group the list, which is
// what makes a long palette scannable.
// ---------------------------------------------------------------------------

export function Panel({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[10px] border border-[var(--b-edge-hi)] bg-[var(--b-panel)] backdrop-blur-2xl",
        "shadow-[inset_0_1px_0_var(--b-top),0_24px_60px_rgba(0,0,0,0.65),0_0_40px_color-mix(in_oklab,var(--accent-fill)_10%,transparent)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <p className="bg-black/25 px-4 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">
      {children}
    </p>
  );
}

export function Band({
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
        "relative flex h-[34px] w-full items-center gap-3 pl-4 pr-3 text-left text-[13px]",
        "transition-colors duration-[120ms] motion-reduce:transition-none",
        active
          ? "bg-[color-mix(in_oklab,var(--accent-fill)_11%,transparent)] text-zinc-50"
          : "text-zinc-400 hover:bg-[var(--b-key)] hover:text-zinc-200",
        className,
      )}
      {...props}
    >
      {active ? (
        <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-accent-fill" />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active ? (
        <kbd className="shrink-0 rounded-[3px] border border-[var(--b-edge-hi)] bg-[var(--b-key)] px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 shadow-[var(--b-lift)]">
          ↵
        </kbd>
      ) : hint ? (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
          {hint}
        </span>
      ) : null}
    </button>
  );
}
