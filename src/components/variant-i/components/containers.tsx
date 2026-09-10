"use client";

import type { ReactNode } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Surface — the library's material root. Tokens live in styles.css under
 * `[data-variant-i]`; this component only marks the boundary and positions
 * its children.
 */
export function Surface({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={className}>{children}</div>;
}

/** Card — very dark, hairline edge, faint red ambient bloom at one corner. */
export function Card({
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
        "relative overflow-hidden rounded-xl border border-[var(--vi-edge)] bg-white/[0.02] p-4",
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
// Tabs — segmented well with a sliding active pill, like the settings and
// board tab bars. Panels fade on switch.
// ---------------------------------------------------------------------------

export function Tabs<T extends string>({
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
      className="relative flex h-9 items-center gap-0.5 rounded-lg border border-[var(--vi-edge)] bg-[var(--vi-well)] p-1 shadow-[var(--vi-sink)]"
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
              "focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)] focus-visible:ring-offset-1 focus-visible:ring-offset-[#0a0a0e]",
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

export function TabPanel({ tabKey, children }: { tabKey: string; children: ReactNode }) {
  return (
    <div
      key={tabKey}
      role="tabpanel"
      className="[animation:vi-fade_0.16s_ease-out] motion-reduce:[animation:none]"
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rail — the app's icon rail in miniature: stacked icon + micro-label tiles,
// active tile lit like the production rail, counts as corner badges.
// ---------------------------------------------------------------------------

export function Rail({
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
              "focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
              activeItem
                ? "border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_15%,transparent)] text-accent-text shadow-[0_0_18px_color-mix(in_oklab,var(--accent-fill)_16%,transparent)]"
                : "border-transparent text-zinc-500 hover:border-[var(--vi-edge)] hover:bg-white/[0.04] hover:text-zinc-200",
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
// Accordion — folder-janitor style disclosure rows with a rotating chevron
// and a height-animated body.
// ---------------------------------------------------------------------------

export function Accordion({
  items,
  defaultOpen = 0,
}: {
  items: ReadonlyArray<{ title: string; meta: string; body: string }>;
  defaultOpen?: number | null;
}) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--vi-edge)]">
      {items.map((item, index) => {
        const isOpen = open === index;
        return (
          <div key={item.title} className="border-b border-[var(--vi-edge)] last:border-b-0">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : index)}
              className="flex h-11 w-full items-center gap-2.5 px-3 text-left outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--vi-focus)]"
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