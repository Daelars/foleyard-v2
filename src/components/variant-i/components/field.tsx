"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/** Inset well field: darker than buttons, red-lit when invalid. */
export function Field({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-[var(--vi-edge)] bg-[var(--vi-well)] px-3 text-[13px] text-zinc-100",
        "shadow-[var(--vi-sink)] outline-none placeholder:text-zinc-600",
        "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
        "hover:border-[var(--vi-edge-hi)]",
        "focus:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] focus:shadow-[var(--vi-sink),0_0_16px_color-mix(in_oklab,var(--accent-fill)_10%,transparent)]",
        "aria-[invalid=true]:border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] aria-[invalid=true]:bg-[color-mix(in_oklab,var(--accent-fill)_9%,rgba(0,0,0,0.42))] aria-[invalid=true]:text-accent-text aria-[invalid=true]:placeholder:text-accent-text/60",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}

/** Keyboard hint chip. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--vi-edge-hi)] bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.02))] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 shadow-[var(--vi-lift)] [&_svg]:size-3">
      {children}
    </kbd>
  );
}

/** Pagination page button — a small square number tile. */
export function PageButton({
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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0e]",
        active
          ? "border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_14%,transparent)] text-accent-text shadow-[0_0_14px_color-mix(in_oklab,var(--accent-fill)_12%,transparent)]"
          : "border-[var(--vi-edge)] bg-white/[0.02] text-zinc-400 hover:border-[var(--vi-edge-hi)] hover:text-zinc-100",
      )}
      {...props}
    >
      {label}
    </button>
  );
}

/**
 * Select with a viewport-fixed floating menu. The menu is NOT absolutely
 * positioned inside the card: cards use overflow-hidden for their corner
 * bloom, which would clip an in-card menu to invisibility. It measures from
 * the trigger on open and repositions on scroll/resize.
 */
export function Select({
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
          "flex h-10 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-[var(--vi-edge)] bg-[var(--vi-well)] px-3 text-left text-[13px] text-zinc-200",
          "shadow-[var(--vi-sink)] outline-none transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
          "hover:border-[var(--vi-edge-hi)]",
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
            "fixed z-[70] overflow-hidden rounded-lg border border-[var(--vi-edge-hi)] bg-[#141419] p-1 shadow-[0_16px_44px_rgba(0,0,0,0.65),0_0_24px_color-mix(in_oklab,var(--accent-fill)_6%,transparent)]",
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
            className="vi-scroll grid max-h-[208px] gap-0.5 overflow-y-auto outline-none"
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