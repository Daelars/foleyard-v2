"use client";

import { useState } from "react";
import { ArrowUpRight, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useV2ExtensionEntries } from "./use-v2-extension-entries";
import { V2SettingControl, type V2ExtensionSettingsEntry } from "./settings";

/**
 * v2 extension cards for the Tools grid. Card markup mirrors the v1
 * `ExtensionCard` in `src/components/ExtensionGrid.tsx` so both
 * generations read as one list; the info button opens a details
 * dialog mirroring `ExtensionDetailsDialog` in
 * `src/app/library/dialogs.tsx` (description, permissions with
 * approval, settings, actions).
 */
export function V2ToolsCards({ onRunPack }: { onRunPack?: () => void }) {
  const { entries, loading, toggle, updateSetting, reset, approve } =
    useV2ExtensionEntries();
  const [detailsId, setDetailsId] = useState<string | null>(null);

  if (loading) {
    return null;
  }
  const details = entries.find((entry) => entry.id === detailsId) ?? null;
  return (
    <>
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.06]"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-fill/12 text-lg font-bold text-accent-text">
            {entry.name.slice(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight text-zinc-50">
              {entry.name}
            </p>
            <p className="mt-0.5 truncate text-xs font-medium text-zinc-400">
              {entry.description}
            </p>
            <p className="mt-1 font-mono text-[10px] text-zinc-500">
              v{entry.version} ·{" "}
              {entry.rows.length
                ? `${entry.rows.length} settings`
                : "no settings"}{" "}
              · v2
            </p>
          </div>

          {entry.id === "make-pack-v2" && onRunPack ? (
            <Button
              variant="ghost"
              className="hidden h-8 shrink-0 gap-1.5 rounded-lg border border-accent-fill/40 bg-accent-fill/10 px-2.5 text-[11px] text-accent-text hover:bg-accent-fill/15 hover:text-accent-text sm:inline-flex"
              onClick={(e) => {
                e.stopPropagation();
                onRunPack();
              }}
            >
              <ArrowUpRight className="size-3 shrink-0" />
              <span className="truncate">Make pack</span>
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:border-accent-fill/50 hover:bg-white/[0.08] hover:text-zinc-100"
            onClick={(e) => {
              e.stopPropagation();
              setDetailsId(entry.id);
            }}
            aria-label={`View ${entry.name} details`}
            title="Extension details"
          >
            <span className="sr-only">Extension details</span>
            <Info className="size-3.5" />
          </Button>

          <Switch
            checked={entry.enabled}
            onCheckedChange={(checked) => void toggle(entry.id, checked)}
            aria-label={`Toggle ${entry.name}`}
            className="shrink-0"
          />
        </div>
      ))}

      <V2ExtensionDetailsDialog
        entry={details}
        onOpenChange={(open) => {
          if (!open) setDetailsId(null);
        }}
        onUpdateSetting={(settingId, value) =>
          details && void updateSetting(details.id, settingId, value)
        }
        onReset={() => details && void reset(details.id)}
        onApprove={(permissions) =>
          details && void approve(details.id, permissions)
        }
        onRunPack={
          details?.id === "make-pack-v2" && onRunPack
            ? () => {
                setDetailsId(null);
                onRunPack();
              }
            : undefined
        }
      />
    </>
  );
}

function V2ExtensionDetailsDialog({
  entry,
  onOpenChange,
  onUpdateSetting,
  onReset,
  onApprove,
  onRunPack,
}: {
  entry: V2ExtensionSettingsEntry | null;
  onOpenChange: (open: boolean) => void;
  onUpdateSetting: (settingId: string, value: unknown) => void;
  onReset: () => void;
  onApprove: (permissions: string[]) => void;
  onRunPack?: () => void;
}) {
  const denied =
    entry?.declaredPermissions.filter(
      (permission) => !entry.effectivePermissions.includes(permission),
    ) ?? [];
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-shell/95 p-6 backdrop-blur-2xl sm:max-w-2xl">
        <DialogTitle className="text-lg font-extrabold tracking-tight text-zinc-50">
          {entry?.name ?? "Extension details"}
        </DialogTitle>
        {entry ? (
          <div className="space-y-5 text-sm">
            <div className="space-y-1">
              <p className="text-zinc-400">{entry.description}</p>
              <p className="font-mono text-xs text-zinc-500">
                Foleyard · v{entry.version} · v2
              </p>
            </div>

            <div
              className={cn(
                "items-start gap-5",
                onRunPack && "grid md:grid-cols-[auto_minmax(0,1fr)]",
              )}
            >
              {onRunPack ? (
                <div className="min-w-0 space-y-2">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Actions
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onRunPack}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-zinc-300 ring-1 ring-white/10 transition-colors hover:border-accent-fill/50 hover:bg-accent-fill/10 hover:text-accent-text hover:ring-accent-fill/30"
                      title="Run: Make pack"
                    >
                      Make pack
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="min-w-0 space-y-2">
                <h3 className="text-sm font-semibold text-zinc-200">
                  Permissions
                </h3>
                {entry.declaredPermissions.length ? (
                  <div className="flex flex-wrap gap-2">
                    {entry.declaredPermissions.map((permission) => {
                      const granted =
                        entry.effectivePermissions.includes(permission);
                      return (
                        <span
                          key={permission}
                          className={cn(
                            "rounded-full border px-2 py-1 font-mono text-xs ring-1",
                            granted
                              ? "border-white/10 bg-white/5 text-zinc-400 ring-white/10"
                              : "border-destructive/40 bg-white/5 text-destructive ring-white/10",
                          )}
                          title={
                            granted
                              ? `Permission "${permission}" is granted; the host authorizes each operation.`
                              : `Permission "${permission}" is declared but not granted; commands needing it stay disabled with a reason.`
                          }
                        >
                          {permission}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">
                    No permissions declared.
                  </p>
                )}
                {denied.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] text-zinc-500">
                      {denied.length} declared permission(s) not granted —
                      affected commands show why they are unavailable instead of
                      failing.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => onApprove(entry.declaredPermissions)}
                    >
                      Approve all
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-200">
                  Settings
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={onReset}
                  title="Reset all settings to declared defaults"
                >
                  Reset
                </Button>
              </div>
              {entry.rows.length ? (
                <div
                  className={cn(
                    "divide-y divide-white/5 border-y border-white/5",
                    !entry.enabled && "opacity-50",
                  )}
                >
                  {entry.rows.map((row) => (
                    <V2SettingControl
                      key={row.declaration.id}
                      extensionId={entry.id}
                      row={row}
                      disabled={!entry.enabled}
                      onUpdate={(settingId, value) =>
                        onUpdateSetting(settingId, value)
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">No settings declared.</p>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
