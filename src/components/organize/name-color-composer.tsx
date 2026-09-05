"use client";

import { onColorText } from "@/lib/item-colors";

import { Swatches } from "./swatches";

/** A composer submits only when its name carries non-whitespace content. */
export function isComposerNameValid(name: string): boolean {
  return name.trim().length > 0;
}

export function NameColorComposer({
  name,
  color,
  onNameChange,
  onColorChange,
  onSubmit,
  onCancel,
  submitLabel,
  namePlaceholder,
  nameAriaLabel,
}: {
  name: string;
  color: string;
  onNameChange: (name: string) => void;
  onColorChange: (color: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  namePlaceholder: string;
  nameAriaLabel: string;
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <input
          autoFocus
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSubmit();
            }
            if (event.key === "Escape") {
              onCancel();
            }
          }}
          placeholder={namePlaceholder}
          aria-label={nameAriaLabel}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-semibold text-zinc-100 placeholder:font-normal placeholder:text-zinc-600 focus:border-accent-fill/60 focus:outline-none"
        />
        <Swatches value={color} onPick={onColorChange} />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-2 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!isComposerNameValid(name)}
          className="rounded-xl px-4 py-2 text-xs font-semibold transition-all active:scale-95 disabled:opacity-40"
          style={{ backgroundColor: color, color: onColorText(color) }}
        >
          {submitLabel}
        </button>
      </div>
    </>
  );
}
