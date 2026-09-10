// PROTOTYPE ONLY — variant E control set, "House style".
//
// E is not a new visual idea. Foleyard already has a consistent language; it
// just never reached the buttons, tags, switches and palette. Every value here
// is lifted from something already on screen:
//
//   radius 12px (rounded-xl)        IconRail items, search bar, the F logo
//   bg-white/[0.04] + border-white/10   search bar shell (page.tsx:659)
//   active = accent/50 border,
//     accent/15 fill, glow          active rail item (IconRail.tsx:39)
//   15px/medium body, 11px mono meta   file row (file-row.tsx:157,165)
//   10px semibold uppercase widest     rail labels
//   selected = accent/10 + 3px rail     file row selection (file-row.tsx:144)
//
// The one thing B got right — the lit coral action — survives, because it was
// the rail's active treatment all along. Everything else is rebuilt airy
// rather than machined.
"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from "react";
import { Search } from "lucide-react";
import type { TagOrigin } from "@yard-core";

import { cn } from "@/lib/utils";
import { TagOriginMark } from "@/components/FileTable/tag-origin-mark";

// ---------------------------------------------------------------------------
// Action. 36px standard so it sits level with the app's h-9 call sites and
// reads against the 44px search bar; 32px compact. Labels are 13px and never
// dimmer than zinc-200 — B's 11.5px zinc-400 small buttons were unreadable.
// Primary is the rail's active treatment: coral border, coral wash, glow,
// coral icon. Not a coral slab, not a machined key.
// ---------------------------------------------------------------------------

const ACTION_SIZES = {
  md: "h-9 gap-2 px-3.5 text-[13px] [&_svg]:size-4",
  sm: "h-8 gap-1.5 px-3 text-[12.5px] [&_svg]:size-[15px]",
  icon: "size-9 [&_svg]:size-4",
  "icon-sm": "size-8 [&_svg]:size-[15px]",
};

const ACTION_TONES = {
  primary:
    "border-accent-fill/50 bg-accent-fill/15 text-zinc-50 shadow-glow-accent hover:border-accent-fill/70 hover:bg-accent-fill/25 [&_svg]:text-accent-text",
  secondary:
    "border-white/10 bg-white/5 text-zinc-200 hover:border-white/20 hover:bg-white/[0.09] hover:text-zinc-50 [&_svg]:text-zinc-400 hover:[&_svg]:text-zinc-200",
  ghost:
    "border-transparent text-zinc-300 hover:border-white/10 hover:bg-white/5 hover:text-zinc-50 [&_svg]:text-zinc-400 hover:[&_svg]:text-zinc-200",
  danger:
    "border-red-400/40 bg-red-500/10 text-red-300 hover:border-red-400/60 hover:bg-red-500/20 hover:text-red-200 [&_svg]:text-red-300",
};

export function Action({
  tone = "secondary",
  size = "md",
  pending = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: keyof typeof ACTION_TONES;
  size?: keyof typeof ACTION_SIZES;
  pending?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled ?? pending}
      aria-busy={pending || undefined}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden whitespace-nowrap rounded-xl border font-medium outline-none",
        "transition-[background-color,border-color,color,box-shadow] duration-150 motion-reduce:transition-none",
        "focus-visible:border-accent-fill/60 focus-visible:ring-2 focus-visible:ring-accent-fill/30",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0",
        ACTION_SIZES[size],
        ACTION_TONES[tone],
        // Unavailable stays legible: it keeps its border and reads as a
        // dimmed-but-present control, not 45%-opacity debris.
        "disabled:pointer-events-none disabled:border-white/[0.07] disabled:bg-white/[0.02] disabled:text-zinc-500 disabled:shadow-none disabled:[&_svg]:text-zinc-600",
        className,
      )}
      {...props}
    >
      {children}
      {pending ? (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-accent-fill/20"
        >
          <span className="block h-full w-1/3 bg-accent-fill [animation:e-scan_1.2s_ease-in-out_infinite] motion-reduce:[animation:none]" />
        </span>
      ) : null}
    </button>
  );
}

/** The one keyframe C adds. Mounted once by the variant root. */
export function ActionKeyframes() {
  return (
    <style>{`@keyframes e-scan { 0% { transform: translateX(-110%); } 100% { transform: translateX(340%); } }`}</style>
  );
}

// ---------------------------------------------------------------------------
// Tags. The library does NOT put tags in containers — file-row.tsx renders
// them as a middot-separated mono line under the filename. That is the app's
// real tag language, so MetaLine is the primary form and matches the library
// exactly. TagChip exists only for the board and organize surfaces, where tags
// are picked rather than read, and it is airy (white/5, rounded-lg) instead of
// a recessed slot.
// ---------------------------------------------------------------------------

export type MetaTag = { name: string; provenance?: TagOrigin; confidence?: number };

export function MetaLine({
  format,
  tags,
  className,
}: {
  format?: string;
  tags: MetaTag[];
  className?: string;
}) {
  const parts: ReactNode[] = [];
  if (format) parts.push(<span key="format">{format}</span>);
  for (const tag of tags) {
    parts.push(
      <span key={tag.name}>
        {tag.name} <TagOriginMark origin={tag.provenance} confidence={tag.confidence} />
      </span>,
    );
  }
  return (
    <span className={cn("block truncate font-mono text-[11px] text-zinc-400", className)}>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 ? <span className="text-zinc-600"> · </span> : null}
          {part}
        </span>
      ))}
    </span>
  );
}

export function TagChip({
  name,
  selected = false,
  provenance,
  confidence,
  onClick,
}: {
  name: string;
  selected?: boolean;
  provenance?: TagOrigin;
  confidence?: number;
  onClick?: () => void;
}) {
  const interactive = Boolean(onClick);
  const Tag = interactive ? "button" : "span";
  return (
    <Tag
      {...(interactive ? { type: "button" as const, onClick } : {})}
      aria-pressed={interactive ? selected : undefined}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-lg border px-2 font-mono text-[11px]",
        "transition-[background-color,border-color,color] duration-150 motion-reduce:transition-none",
        selected
          ? "border-accent-fill/50 bg-accent-fill/15 text-accent-text"
          : "border-white/10 bg-white/5 text-zinc-300",
        interactive &&
          "outline-none hover:border-white/20 hover:bg-white/[0.09] hover:text-zinc-100 focus-visible:border-accent-fill/60 focus-visible:ring-2 focus-visible:ring-accent-fill/30",
      )}
    >
      {name}
      {provenance ? <TagOriginMark origin={provenance} confidence={confidence} /> : null}
    </Tag>
  );
}

// ---------------------------------------------------------------------------
// Segmented. The All / Manual / Rules / AI filter is written inline in
// page.tsx:736 and is the app's existing "pick one" control. Promoted to a
// component so the palette, settings and board can reuse it instead of each
// inventing a row of buttons.
// ---------------------------------------------------------------------------

export function Segmented<T extends string | null>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "rounded-md px-2 py-1 font-mono text-[11px] transition-colors duration-150",
            value === option.value
              ? "bg-white/10 font-bold text-zinc-100"
              : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fields. SearchField is the app's own search bar, which is the widest and
// most-looked-at control in the product: rounded-xl, white/[0.04], 15px medium
// text, and a coral border plus glow on focus. Everything that takes text now
// matches it, so a field never looks imported from another app.
// ---------------------------------------------------------------------------

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  trailing,
  inputRef,
  ...props
}: {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label: string;
  trailing?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "placeholder">) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 transition-all duration-150 focus-within:border-accent-fill/60 focus-within:bg-white/[0.06] focus-within:shadow-glow-accent motion-reduce:transition-none">
      <Search className="size-4 shrink-0 text-zinc-500" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="w-full bg-transparent py-2.5 text-[15px] font-medium text-zinc-50 outline-none placeholder:font-normal placeholder:text-zinc-600"
        {...props}
      />
      {trailing}
    </div>
  );
}

/** Compact field for settings rows. Same material, one step down in scale. */
export function Field({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full min-w-0 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-[13px] text-zinc-100 outline-none",
        "transition-all duration-150 motion-reduce:transition-none placeholder:text-zinc-600",
        "hover:border-white/20",
        "focus:border-accent-fill/60 focus:bg-white/[0.06] focus:shadow-glow-accent",
        "aria-[invalid=true]:border-red-400/50 aria-[invalid=true]:bg-red-500/[0.06]",
        "disabled:border-white/[0.07] disabled:bg-white/[0.02] disabled:text-zinc-600",
        className,
      )}
      {...props}
    />
  );
}

/** Mono chip used for shortcut and count hints, as in the header's ⌘K button. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[11px] text-zinc-400">
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Toggle. Softened to match the rail and search bar rather than a machined
// slot: rounded-full, white/[0.06] over a white/15 edge. Checked still reads
// without colour — the thumb travels and gains a coral core — but the track
// now uses the same accent/15 wash as every other active thing in the app.
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
      className="group grid h-9 w-12 shrink-0 place-items-center outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={cn(
          "relative h-[22px] w-10 rounded-full border transition-all duration-150 motion-reduce:transition-none",
          "group-focus-visible:ring-2 group-focus-visible:ring-accent-fill/30",
          checked
            ? "border-accent-fill/50 bg-accent-fill/25 shadow-glow-accent"
            : "border-white/15 bg-white/[0.06] group-hover:border-white/25 group-hover:bg-white/[0.09]",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-zinc-200 shadow-sm ring-1 ring-black/20",
            "transition-transform duration-150 group-active:scale-95 motion-reduce:transition-none",
            checked ? "translate-x-[19px]" : "translate-x-[3px]",
          )}
        >
          <span
            className={cn(
              "absolute inset-[4px] rounded-full bg-accent-fill transition-opacity duration-150 motion-reduce:transition-none",
              checked ? "opacity-100" : "opacity-0",
            )}
          />
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// SettingRow. Row rhythm borrowed from the 64px file row; label at the file
// row's 15px/medium so a settings list and a library list feel like the same
// product. Control aligns to the label's first line.
// ---------------------------------------------------------------------------

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-16 items-start gap-4 border-b border-white/5 px-4 py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium leading-6 text-zinc-100">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[12.5px] leading-[1.5] text-zinc-500">{description}</p>
        ) : null}
      </div>
      <div className="flex h-6 shrink-0 items-center">{children}</div>
    </div>
  );
}

/** Micro label, same treatment as the IconRail's item captions. */
export function RailLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{children}</p>
  );
}

// ---------------------------------------------------------------------------
// Palette. The previous pass put an outlined coral capsule around the active
// row — the exact thing the first screenshot complained about — and nested a
// bordered search box inside a bordered panel, so the whole thing read as
// boxes in boxes.
//
// Rebuilt on the distinction the app actually makes. Foleyard has two "active"
// languages, and they are not interchangeable:
//
//   nav / filter chip   bordered, tinted, glowing capsule   (IconRail item)
//   list row selected   accent/10 wash + 3px coral rail     (file-row.tsx:144)
//
// A palette is a list, so it takes the file row's language: a full-bleed band
// with a coral rail and no outline. The header is seamless — the panel is
// already the container, so the search field does not get its own. Rows carry
// a section icon, which is what makes a palette feel built rather than sparse,
// and the redundant per-row section hint is gone now that sections are headed.
// ---------------------------------------------------------------------------

export function PalettePanel({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-white/10 bg-shell/95 backdrop-blur-2xl",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_28px_70px_rgba(0,0,0,0.7)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/** Seamless header. No inner border, no focus ring: the panel is the box. */
export function PaletteHeader({
  value,
  onChange,
  inputRef,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className="flex h-14 items-center gap-3 border-b border-white/10 px-4">
      <Search className="size-[18px] shrink-0 text-zinc-500" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Type a command or sound..."
        aria-label="Search commands"
        className="w-full bg-transparent text-[16px] font-medium text-zinc-50 outline-none placeholder:font-normal placeholder:text-zinc-600"
        {...props}
      />
      <Hint>esc</Hint>
    </div>
  );
}

export function PaletteSection({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-zinc-600 first:pt-2">
      {children}
    </p>
  );
}

export function PaletteRow({
  active = false,
  icon,
  children,
  className,
  ref,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "relative flex h-10 w-full items-center gap-3 px-4 text-left text-[14px]",
        "transition-colors duration-150 motion-reduce:transition-none",
        active
          ? "bg-accent-fill/10 font-medium text-zinc-50"
          : "text-zinc-300 hover:bg-white/[0.04] hover:text-zinc-100",
        className,
      )}
      {...props}
    >
      {active ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-accent-fill shadow-glow-accent"
        />
      ) : null}
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center [&_svg]:size-4",
          active ? "text-accent-text" : "text-zinc-500",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active ? (
        <kbd className="shrink-0 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
          ↵
        </kbd>
      ) : null}
    </button>
  );
}

/** Footer affordances. Fills the dead space a bare list leaves behind. */
export function PaletteFooter({ count }: { count: number }) {
  const key = "rounded border border-white/10 bg-white/5 px-1 py-px text-zinc-400";
  return (
    <div className="flex items-center gap-4 border-t border-white/10 px-4 py-2.5 font-mono text-[10px] text-zinc-600">
      <span>
        <span className={key}>↑↓</span> navigate
      </span>
      <span>
        <span className={key}>↵</span> run
      </span>
      <span>
        <span className={key}>esc</span> close
      </span>
      <span className="flex-1" />
      <span>{count} commands</span>
    </div>
  );
}
