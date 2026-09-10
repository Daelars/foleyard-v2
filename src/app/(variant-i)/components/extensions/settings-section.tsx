"use client";

import { Button, ExtensionRow } from "@/components/variant-i";
import { cn } from "@/lib/utils";
import { useV2ExtensionEntries } from "@/components/extensions-v2/use-v2-extension-entries";

import { V3SettingControl } from "./tools-cards";

/**
 * Live v2 settings section for the Settings dialog, I treatment.
 * Wires the generic v2 entries renderer to the real routes: enable/
 * disable (PATCH), validated setting writes (PUT) and resets (POST
 * reset), and explicit permission approval (POST approvals).
 */
export function V3ExtensionsSection({
  onEnabledToggle,
}: {
  /** Fired after an enable/disable write settles so the route catalog refreshes. */
  onEnabledToggle?: (extensionId: string, enabled: boolean) => void;
}) {
  const { entries, loading, error, toggle, updateSetting, reset, approve } =
    useV2ExtensionEntries();

  // Keep the current rows visible while a write-triggered refresh is in
  // flight (stale-while-revalidate); only the first load shows the loader.
  if (loading && entries.length === 0) {
    return <p className="p-6 text-center text-xs text-zinc-500">Loading v2 extensions…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="p-6 text-center text-xs text-accent-text">
        {error}
      </p>
    );
  }
  if (entries.length === 0) {
    return (
      <p className="p-6 text-center text-xs text-zinc-500">
        No v2 extensions registered.
      </p>
    );
  }
  return (
    <div className="w-full space-y-4">
      {entries.map((entry) => {
        const denied = entry.declaredPermissions.filter(
          (permission) => !entry.effectivePermissions.includes(permission),
        );
        return (
          <section
            key={entry.id}
            aria-label={`${entry.name} settings`}
            className="rounded-lg border border-[var(--vi-edge)] bg-black/25 p-4"
          >
            <ExtensionRow
              monogram={entry.name.slice(0, 2).toUpperCase()}
              name={entry.name}
              version={entry.version}
              settingsCount={entry.rows.length}
              description={entry.description}
              enabled={entry.enabled}
              onToggle={(enabled) => {
                void toggle(entry.id, enabled).then(() =>
                  onEnabledToggle?.(entry.id, enabled),
                );
              }}
            />
            <div className="mt-3 space-y-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                  Permissions
                </p>
                {denied.length > 0 && approve ? (
                  <Button
                    tone="secondary"
                    size="sm"
                    onClick={() => approve(entry.id, entry.declaredPermissions)}
                  >
                    Approve all
                  </Button>
                ) : null}
              </div>
              {entry.declaredPermissions.length === 0 ? (
                <p className="text-[11px] text-zinc-600">No permissions declared.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5" aria-label="Permissions">
                  {entry.declaredPermissions.map((permission) => {
                    const granted = entry.effectivePermissions.includes(permission);
                    return (
                      <span
                        key={permission}
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[10.5px]",
                          granted
                            ? "border-emerald-300/25 bg-emerald-300/[0.06] text-emerald-200"
                            : "border-[color-mix(in_oklab,var(--accent-fill)_45%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_8%,transparent)] text-accent-text",
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
              )}
              {denied.length > 0 ? (
                <p className="text-[11px] text-zinc-500">
                  {denied.length} declared permission(s) not granted — affected
                  commands show why they are unavailable instead of failing.
                </p>
              ) : null}
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">
                  Settings
                </p>
                <Button
                  tone="ghost"
                  size="sm"
                  onClick={() => void reset(entry.id)}
                  title="Reset all settings to declared defaults"
                >
                  Reset
                </Button>
              </div>
              {entry.rows.length === 0 ? (
                <p className="text-xs text-zinc-600">No settings declared.</p>
              ) : (
                <div
                  className={cn(
                    "space-y-2",
                    !entry.enabled && "pointer-events-none opacity-50",
                  )}
                  aria-disabled={!entry.enabled}
                >
                  {entry.rows.map((row) => (
                    <V3SettingControl
                      key={row.declaration.id}
                      extensionId={entry.id}
                      row={row}
                      disabled={!entry.enabled}
                      onUpdate={(settingId, value) =>
                        void updateSetting(entry.id, settingId, value)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}