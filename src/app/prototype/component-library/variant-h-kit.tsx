// PROTOTYPE ONLY — variant H kit. Covers the production components G's grid
// never showed: tabs (settings/board), slider (volume/zoom), menu (file-row
// context actions), toast (scan/collection feedback), icon rail, transport
// waveform, and accordion (folder-janitor style). Same dark-acrylic language
// as the D/G kits, same element-motion treatment as G.

"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Check, ChevronDown, Info, X } from "lucide-react";

import { cn } from "@/lib/utils";

/** Mount once alongside GKeyframes. */
export function HKeyframes() {
  return (
    <style>{`
@keyframes h-fade { from { opacity: 0; } to { opacity: 1; } }
`}</style>
  );
}

// ---------------------------------------------------------------------------
// Slider — inset track, red fill with glow, glass thumb. Pointer drag plus
// full keyboard support via a real slider role.
// ---------------------------------------------------------------------------

export function HSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  formatValue,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  formatValue?: (value: number) => string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  const text = formatValue ? formatValue(value) : `${Math.round(value)}`;

  const setFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = min + ratio * (max - min);
    onChange?.(Math.min(max, Math.max(min, Math.round(raw / step) * step)));
  };

  return (
    <div className="flex items-center gap-3">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={text}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setFromClientX(event.clientX);
          const onMove = (moveEvent: PointerEvent) => setFromClientX(moveEvent.clientX);
          const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            onChange?.(Math.max(min, value - step));
          } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            onChange?.(Math.min(max, value + step));
          } else if (event.key === "Home") {
            event.preventDefault();
            onChange?.(min);
          } else if (event.key === "End") {
            event.preventDefault();
            onChange?.(max);
          }
        }}
        className="group relative flex h-6 min-w-0 flex-1 cursor-pointer touch-none items-center outline-none"
      >
        <span className="relative h-1 w-full overflow-visible rounded-full bg-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--accent-fill)_70%,transparent),var(--accent-fill))] shadow-[0_0_10px_color-mix(in_oklab,var(--accent-fill)_35%,transparent)]"
            style={{ width: `${pct * 100}%` }}
          />
        </span>
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/50",
            "bg-[linear-gradient(180deg,#ffffff,#d4d4d8)]",
            "shadow-[0_1px_3px_rgba(0,0,0,0.6),0_0_0_0_transparent]",
            "transition-[box-shadow,scale] duration-150 motion-reduce:transition-none",
            "group-hover:scale-110 group-focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent-fill)_35%,transparent)] group-focus-visible:outline-none group-active:scale-95",
          )}
          style={{ left: `${pct * 100}%` }}
        />
      </div>
      <span className="w-11 shrink-0 text-right font-mono text-[11px] tabular-nums text-zinc-400">
        {text}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs — segmented well with a sliding active pill, like the settings and
// board tab bars. Panels fade on switch.
// ---------------------------------------------------------------------------

export function HTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: ReadonlyArray<{ value: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const buttonRefs = useRef(new Map<T, HTMLButtonElement>());
  const [pill, setPill] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const button = buttonRefs.current.get(value);
      if (!button) return;
      setPill({ left: button.offsetLeft, width: button.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value, tabs]);

  return (
    <div
      role="tablist"
      aria-label={label}
      className="relative flex h-9 items-center gap-0.5 rounded-lg border border-[var(--d-edge)] bg-[var(--d-well)] p-1 shadow-[var(--d-sink)]"
    >
      <span
        aria-hidden
        className="absolute top-1 h-7 rounded-md border border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] shadow-[0_0_14px_color-mix(in_oklab,var(--accent-fill)_10%,transparent),inset_0_1px_0_rgba(255,255,255,0.07)] transition-[left,width] duration-200 ease-out motion-reduce:transition-none"
        style={{ left: pill.left, width: pill.width }}
      />
      {tabs.map((tab) => {
        const activeTab = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              if (node) buttonRefs.current.set(tab.value, node);
              else buttonRefs.current.delete(tab.value);
            }}
            type="button"
            role="tab"
            aria-selected={activeTab}
            onClick={() => onChange(tab.value)}
            className={cn(
              "relative z-10 flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0a0a0e]",
              activeTab ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-200",
              "[&_svg]:size-3.5",
              activeTab ? "[&_svg]:text-accent-text" : "[&_svg]:text-zinc-600",
            )}
          >
            {tab.icon}
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function HTabPanel({ tabKey, children }: { tabKey: string; children: ReactNode }) {
  return (
    <div
      key={tabKey}
      role="tabpanel"
      className="[animation:h-fade_0.16s_ease-out] motion-reduce:[animation:none]"
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Menu — file-row context actions as an open panel: filename label, icon
// items, separator, danger item. Hover states, checkable favorite.
// ---------------------------------------------------------------------------

export function HMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--d-edge-hi)] bg-[#141419] p-1 shadow-[0_16px_44px_rgba(0,0,0,0.6)]">
      <p className="truncate px-2.5 pb-1.5 pt-2 font-mono text-[10.5px] text-zinc-500" title={label}>
        {label}
      </p>
      {children}
    </div>
  );
}

export function HMenuItem({
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
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-[13px] outline-none transition-[background-color,color,transform] duration-100",
        "motion-safe:active:scale-[0.99]",
        "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]",
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

export function HMenuSeparator() {
  return <div aria-hidden className="mx-2 my-1 h-px bg-[var(--d-edge)]" />;
}

// ---------------------------------------------------------------------------
// Toast — scan/collection feedback: status icon, title, message, dismiss.
// ---------------------------------------------------------------------------

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
    ring: "border-[var(--d-edge-hi)]",
  },
};

export function HToast({
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
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-[var(--d-edge)] bg-white/[0.04]">
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
          className="grid size-6 shrink-0 place-items-center rounded-md text-zinc-600 outline-none transition-colors hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rail — the app's icon rail in miniature: stacked icon + micro-label tiles,
// active tile lit like the production rail, counts as corner badges.
// ---------------------------------------------------------------------------

export function HRail({
  view,
  onChange,
  favorites,
  shelf,
}: {
  view: string;
  onChange: (view: string) => void;
  favorites: number;
  shelf: number;
}) {
  const items: Array<{ id: string; label: string; badge?: number }> = [
    { id: "library", label: "Library" },
    { id: "favorites", label: "Favor", badge: favorites },
    { id: "shelf", label: "Shelf", badge: shelf },
    { id: "extensions", label: "Ext" },
  ];
  return (
    <div className="flex flex-col items-center gap-1.5" role="tablist" aria-label="Views">
      {items.map((item) => {
        const activeItem = item.id === view;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={activeItem}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative flex w-16 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[10px] font-semibold uppercase tracking-widest outline-none transition-[background-color,border-color,box-shadow,color,transform] duration-150",
              "motion-safe:hover:-translate-y-px motion-safe:active:scale-[0.96]",
              "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]",
              activeItem
                ? "border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_15%,transparent)] text-accent-text shadow-[0_0_18px_color-mix(in_oklab,var(--accent-fill)_16%,transparent)]"
                : "border-transparent text-zinc-500 hover:border-[var(--d-edge)] hover:bg-white/[0.04] hover:text-zinc-200",
              "[&_svg]:size-5",
            )}
          >
            {item.badge ? (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-accent-fill px-1 font-mono text-[9px] font-bold leading-tight text-white">
                {item.badge}
              </span>
            ) : null}
            <RailGlyph id={item.id} />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function RailGlyph({ id }: { id: string }) {
  // Glyphs mirror IconRail's set without importing app chrome.
  if (id === "favorites") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    );
  }
  if (id === "shelf") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M11 12H3" />
        <path d="M16 8h-5" />
        <path d="M16 16h-5" />
        <path d="m19 10 2 2-2 2" />
      </svg>
    );
  }
  if (id === "extensions") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m12 2 9 4.9v9.9L12 22l-9-5.1V6.9L12 2Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m16 6 4 14" />
      <path d="M12 6v14" />
      <path d="M8 8v12" />
      <path d="M4 4v16" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Scrubber — the shell's seek bar as a bar strip: played bars in glowing
// accent, the rest dimmed, with a playhead knob that reveals on hover and
// focus. Click/drag seeks; arrows nudge by a second.
// ---------------------------------------------------------------------------

function fmtClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function HScrubber({
  peaks,
  progress,
  duration,
  onSeek,
  label,
}: {
  peaks: ReadonlyArray<number>;
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
  label: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const current = progress * duration;

  const setFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeek(ratio * duration);
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(current)}
      aria-valuetext={`${fmtClock(current)} of ${fmtClock(duration)}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setFromClientX(event.clientX);
        const onMove = (moveEvent: PointerEvent) => setFromClientX(moveEvent.clientX);
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          onSeek(Math.max(0, current - 1));
        } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          onSeek(Math.min(duration, current + 1));
        } else if (event.key === "Home") {
          event.preventDefault();
          onSeek(0);
        } else if (event.key === "End") {
          event.preventDefault();
          onSeek(duration);
        }
      }}
      className="group relative flex h-7 cursor-pointer touch-none items-center outline-none"
    >
      <div aria-hidden className="flex h-full w-full items-center gap-[2px]">
        {peaks.map((peak, index) => {
          const played = index / peaks.length <= progress;
          return (
            <span
              key={index}
              className={cn(
                "w-full min-w-[2px] rounded-full transition-[background-color] duration-100",
                played
                  ? "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_85%,white_8%),color-mix(in_oklab,var(--accent-fill)_60%,transparent))]"
                  : "bg-white/10 group-hover:bg-white/20",
              )}
              style={{ height: `${Math.round(peak * 100)}%` }}
            />
          );
        })}
      </div>
      <span
        aria-hidden
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-[0_0_10px_rgba(255,255,255,0.7)] transition-opacity duration-150 group-focus-visible:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
        style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waveform — transport strip: played bars in accent, the rest dimmed.
// ---------------------------------------------------------------------------

export function HWaveform({ peaks, progress }: { peaks: ReadonlyArray<number>; progress: number }) {
  return (
    <div aria-hidden className="flex h-12 min-w-0 flex-1 items-center gap-[2px]">
      {peaks.map((peak, index) => {
        const played = index / peaks.length <= progress;
        return (
          <span
            key={index}
            className={cn(
              "w-full min-w-[2px] rounded-full",
              played
                ? "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_85%,white_8%),color-mix(in_oklab,var(--accent-fill)_60%,transparent))]"
                : "bg-zinc-700/60",
            )}
            style={{ height: `${Math.round(peak * 100)}%` }}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accordion — folder-janitor style disclosure rows with a rotating chevron
// and a height-animated body.
// ---------------------------------------------------------------------------

export function HAccordion({
  items,
  defaultOpen = 0,
}: {
  items: ReadonlyArray<{ title: string; meta: string; body: string }>;
  defaultOpen?: number | null;
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--d-edge)]">
      {items.map((item, index) => {
        const isOpen = open === index;
        return (
          <div key={item.title} className="border-b border-[var(--d-edge)] last:border-b-0">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : index)}
              className="flex h-11 w-full items-center gap-2.5 px-3 text-left outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)]"
            >
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 shrink-0 text-zinc-500 transition-transform duration-200 motion-reduce:transition-none",
                  isOpen && "rotate-180 text-accent-text",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-100">
                {item.title}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] text-zinc-500">{item.meta}</span>
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <p className="px-3 pb-3 pl-[38px] text-xs leading-relaxed text-zinc-500">
                  {item.body}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
