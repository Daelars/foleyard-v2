"use client";

import { useEffect, useState } from "react";
import { Trash2, Keyboard } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { TabsContent } from "@/components/ui/tabs";

import { DEFAULT_SHORTCUTS, SHORTCUT_LABELS, findBindingConflicts, type ShortcutAction } from "@/components/Shortcuts/shortcuts";

import type { ShortcutsTabProps } from "./types";

export function ShortcutsTab({ shortcutBindings, onRebindShortcut, onResetShortcuts, removeDefault, onRemoveDefaultChange }: ShortcutsTabProps) {
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
          <TabsContent value="customisation" className="m-0 flex-1 p-8 outline-none">
            <div className="mx-auto w-full max-w-3xl space-y-10">
              <div>
                <h3 className="text-3xl font-bold tracking-tight text-zinc-50">Customisation</h3>
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
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        onResetShortcuts();
                        setRebindingAction(null);
                      }}
                      className="h-8 rounded-lg border-white/15 bg-white/5 font-mono text-[10px] uppercase tracking-widest text-zinc-200 hover:border-accent-fill/50 hover:text-zinc-100"
                    >
                      Reset to defaults
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-zinc-500">
                  Select a shortcut, then press a new key. Shortcuts apply
                  immediately and are kept on this device.
                </p>

                <div className="divide-y divide-white/5 border-y border-white/10">
                  {(Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[]).map(
                    (action) => {
                      const bindings = shortcutBindings ?? DEFAULT_SHORTCUTS;
                      const key = bindings[action];
                      const rebinding = rebindingAction === action;
                      return (
                        <div
                          key={action}
                          className="flex items-center gap-3 py-2.5"
                        >
                          <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                            {SHORTCUT_LABELS[action]}
                          </p>
                          <kbd className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-zinc-300">
                            {rebinding
                              ? "Press a key…"
                              : key === "Space"
                                ? "Space"
                                : key.length === 1
                                  ? key.toUpperCase()
                                  : key}
                          </kbd>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setRebindingAction(rebinding ? null : action)
                            }
                            disabled={!onRebindShortcut}
                            className="h-8 shrink-0 rounded-lg px-3 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                          >
                            {rebinding ? "Cancel" : "Change"}
                          </Button>
                        </div>
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
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${(removeDefault ?? "library") === "library" ? "border-accent-fill/60 bg-accent-fill/10" : "border-white/10 bg-white/[0.02] hover:border-white/20"}`}
                  >
                    <span className="text-sm font-semibold text-zinc-100">
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
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${(removeDefault ?? "library") === "disk" ? "border-destructive/60 bg-destructive/10" : "border-white/10 bg-white/[0.02] hover:border-white/20"}`}
                  >
                    <span className="text-sm font-semibold text-zinc-100">
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
          </TabsContent>
  );
}
