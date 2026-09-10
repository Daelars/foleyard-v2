"use client";

import { useEffect, useState } from "react";
import { Keyboard, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button, ShortcutHint, ShortcutRow } from "@/components/variant-i";

import { cn } from "@/lib/utils";

import { DEFAULT_SHORTCUTS, SHORTCUT_LABELS, findBindingConflicts, type ShortcutAction } from "@/components/Shortcuts/shortcuts";

import type { ShortcutsTabProps } from "@/components/settings/types";

export function V3SettingsShortcutsTab({ shortcutBindings, onRebindShortcut, onResetShortcuts, removeDefault, onRemoveDefaultChange }: ShortcutsTabProps) {
  const [rebindingAction, setRebindingAction] =
    useState<ShortcutAction | null>(null);
  useEffect(() => {
    if (!rebindingAction || !onRebindShortcut) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRebindingAction(null);
        return;
      }

      if (
        ["Shift", "Control", "Alt", "Meta", "CapsLock"].includes(
          event.key,
        )
      ) {
        return;
      }

      const key =
        event.key === " "
          ? "Space"
          : event.key.length === 1
            ? event.key.toLowerCase()
            : event.key;
      const conflicts = findBindingConflicts({
        ...(shortcutBindings ?? DEFAULT_SHORTCUTS),
        [rebindingAction]: key,
      });

      if (conflicts.length > 0) {
        const other = conflicts[0].actions.find(
          (action) => action !== rebindingAction,
        );
        toast.error(
          other
            ? `Already assigned to ${SHORTCUT_LABELS[other]}`
            : "That key is already assigned",
        );
        return;
      }

      onRebindShortcut(rebindingAction, key);
      setRebindingAction(null);
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [rebindingAction, shortcutBindings, onRebindShortcut]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10">
      <div>
        <h3 className="text-2xl font-bold tracking-tight text-zinc-50">Customisation</h3>
        <p className="mt-1 text-[13px] text-zinc-500">
          Keyboard shortcuts and destructive-action defaults. Changes apply immediately.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Keyboard className="size-4 text-accent-text" />
            Keyboard shortcuts
          </h4>
          {onResetShortcuts ? (
            <Button
              tone="secondary"
              size="sm"
              onClick={() => {
                onResetShortcuts();
                setRebindingAction(null);
              }}
              className="font-mono text-[10px] uppercase tracking-widest"
            >
              Reset to defaults
            </Button>
          ) : null}
        </div>
        <ShortcutHint>
          Select a shortcut, then press a new key. Shortcuts apply immediately and are kept on this device.
        </ShortcutHint>

        <div className="divide-y divide-white/[0.06] border-y border-[var(--vi-edge)]">
          {(Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]).map(
            (action) => {
              const bindings = shortcutBindings ?? DEFAULT_SHORTCUTS;
              const key = bindings[action];
              const rebinding = rebindingAction === action;
              return (
                <ShortcutRow
                  key={action}
                  label={SHORTCUT_LABELS[action]}
                  binding={key}
                  rebinding={rebinding}
                  onStart={
                    onRebindShortcut
                      ? () => setRebindingAction(action)
                      : () => {}
                  }
                  onCancel={() => setRebindingAction(null)}
                />
              );
            },
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Trash2 className="size-4 text-accent-text" />
            Remove default
          </h4>
        </div>
        <p className="text-xs text-zinc-500">
          Choose which remove behavior the bulk bar confirms with. You
          can still pick the other option in the confirm dialog.
        </p>

        <div
          role="radiogroup"
          aria-label="Default remove behavior"
          className="space-y-2"
        >
          <button
            type="button"
            role="radio"
            aria-checked={(removeDefault ?? "library") === "library"}
            onClick={() => onRemoveDefaultChange?.("library")}
            disabled={!onRemoveDefaultChange}
            className={cn(
              "w-full rounded-xl border p-3 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
              "disabled:pointer-events-none disabled:opacity-50",
              (removeDefault ?? "library") === "library"
                ? "border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)]"
                : "border-[var(--vi-edge)] bg-black/25 hover:border-[var(--vi-edge-hi)]",
            )}
          >
            <span className="block text-sm font-semibold text-zinc-100">
              Remove from library
            </span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Sounds no longer appear in Foleyard. Your files on disk
              are untouched.
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={(removeDefault ?? "library") === "disk"}
            onClick={() => onRemoveDefaultChange?.("disk")}
            disabled={!onRemoveDefaultChange}
            className={cn(
              "w-full rounded-xl border p-3 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]",
              "disabled:pointer-events-none disabled:opacity-50",
              (removeDefault ?? "library") === "disk"
                ? "border-[color-mix(in_oklab,var(--accent-fill)_55%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_10%,transparent)]"
                : "border-[var(--vi-edge)] bg-black/25 hover:border-[var(--vi-edge-hi)]",
            )}
          >
            <span className="block text-sm font-semibold text-zinc-100">
              Delete from disk
            </span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Permanently delete sounds from disk. This cannot be
              undone.
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}