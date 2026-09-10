"use client";

import { cn } from "@/lib/utils";

/** Switch — 40px track, thumb travels on a spring; on-ness is red track +
 * glow, never colour alone (thumb travels too). */
export function Switch({
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
          "relative h-[22px] w-[40px] rounded-full border shadow-[var(--vi-sink)]",
          "transition-[background-color,border-color,box-shadow] duration-150 motion-reduce:transition-none",
          checked
            ? "border-[color-mix(in_oklab,var(--accent-fill)_60%,transparent)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--accent-fill)_55%,transparent),color-mix(in_oklab,var(--accent-fill)_32%,transparent))] shadow-[var(--vi-sink),0_0_16px_color-mix(in_oklab,var(--accent-fill)_22%,transparent)]"
            : "border-[var(--vi-edge-hi)] bg-[var(--vi-well)]",
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

/** Checkbox — the check draws in on toggle; the tile pops. */
export function Checkbox({
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
          "border-[var(--vi-edge-hi)] bg-[var(--vi-well)] shadow-[var(--vi-sink)]",
          "transition-[background-color,border-color,color,box-shadow] duration-150",
          "motion-safe:[animation:vi-pop_0.22s_ease-out] motion-reduce:[animation:none]",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--vi-focus)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#0a0a0e]",
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
              className="motion-safe:[stroke-dasharray:12] motion-safe:[animation:vi-draw_0.18s_ease-out_0.05s_both] motion-reduce:[animation:none]"
            />
          </svg>
        ) : null}
      </span>
      <span className="select-none">{label}</span>
    </label>
  );
}

/** Radio — the dot pops in on selection. */
export function Radio({
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
          "border-[var(--vi-edge-hi)] bg-[var(--vi-well)] shadow-[var(--vi-sink)]",
          "transition-[border-color,box-shadow,transform] duration-150",
          "motion-safe:active:scale-90",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--vi-focus)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#0a0a0e]",
          checked &&
            "border-[color-mix(in_oklab,var(--accent-fill)_70%,transparent)] shadow-[var(--vi-sink),0_0_14px_color-mix(in_oklab,var(--accent-fill)_22%,transparent)]",
        )}
      >
        {checked ? (
          <span
            key="on"
            className="size-[8px] rounded-full bg-accent-fill motion-safe:[animation:vi-pop_0.22s_ease-out] motion-reduce:[animation:none]"
          />
        ) : null}
      </span>
      <span className="select-none">{label}</span>
    </label>
  );
}