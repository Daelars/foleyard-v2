"use client";

import { useState } from "react";

import {
  validateV2SettingValue,
  type ExtensionV2Setting,
} from "@yard-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { v2FocusRing, v2PanelClass } from "./shared";

/**
 * Generic v2 settings adapter (Application context, R6).
 *
 * Validated controls for every declared setting type (boolean,
 * string, number, enum, path), defaults shown beside values, per-
 * setting and whole-extension reset, an enable/disable switch that
 * removes the extension's UI through `contributions-changed`, and
 * permission explanations (declared vs effective). Writes go through
 * the settings routes, which validate against declarations and
 * persist before notifying.
 */

export type V2SettingRow = {
  declaration: ExtensionV2Setting;
  value: unknown;
};

export function V2SettingControl({
  extensionId,
  row,
  disabled,
  onUpdate,
}: {
  extensionId: string;
  row: V2SettingRow;
  disabled: boolean;
  onUpdate: (settingId: string, value: unknown) => void;
}) {
  const { declaration } = row;
  const inputId = `v2-${extensionId}-${declaration.id}`;
  const current =
    row.value !== undefined && row.value !== null
      ? String(row.value)
      : String(declaration.defaultValue ?? "");
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);

  const commit = (raw: string) => {
    const value =
      declaration.type === "number" ? Number.parseFloat(raw)
      : declaration.type === "boolean" ? raw === "true"
      : raw;
    const invalid = validateV2SettingValue(declaration, value);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    onUpdate(declaration.id, value);
  };

  return (
    <div className="grid min-w-0 gap-2 px-3 py-3 sm:grid-cols-[1fr_220px] sm:items-center">
      <div className="min-w-0">
        <label htmlFor={inputId} className="text-sm font-medium text-zinc-100">
          {declaration.label}
        </label>
        {declaration.description ? (
          <p className="mt-0.5 text-xs text-zinc-500">{declaration.description}</p>
        ) : null}
        <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">
          Default: {String(declaration.defaultValue ?? "—")}
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      {declaration.type === "boolean" ? (
        <div className="flex justify-start sm:justify-end">
          <Switch
            id={inputId}
            disabled={disabled}
            checked={row.value === true}
            onCheckedChange={(checked) => {
              setError(null);
              onUpdate(declaration.id, checked);
            }}
          />
        </div>
      ) : declaration.type === "enum" ? (
        <select
          id={inputId}
          disabled={disabled}
          value={String(row.value ?? declaration.defaultValue ?? "")}
          onChange={(event) => {
            const invalid = validateV2SettingValue(declaration, event.target.value);
            if (invalid) {
              setError(invalid);
              return;
            }
            setError(null);
            onUpdate(declaration.id, event.target.value);
          }}
          aria-invalid={error !== null}
          className="h-8 min-w-0 rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {(declaration.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={inputId}
          disabled={disabled}
          type={declaration.type === "number" ? "number" : "text"}
          value={draft}
          aria-invalid={error !== null}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit((event.target as HTMLInputElement).value);
          }}
        />
      )}
    </div>
  );
}

export type V2ExtensionSettingsEntry = {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  declaredPermissions: string[];
  effectivePermissions: string[];
  rows: V2SettingRow[];
};

export function V2ExtensionSettings({
  entries,
  onToggle,
  onUpdateSetting,
  onReset,
  onApprove,
}: {
  entries: V2ExtensionSettingsEntry[];
  onToggle: (extensionId: string, enabled: boolean) => void;
  onUpdateSetting: (extensionId: string, settingId: string, value: unknown) => void;
  onReset: (extensionId: string) => void;
  /** Approve the extension's declared permissions (explicit; never implicit). */
  onApprove?: (extensionId: string, permissions: string[]) => void;
}) {
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
          <section key={entry.id} aria-label={`${entry.name} settings`} className={cn(v2PanelClass, "p-4")}>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-zinc-100">{entry.name}</h3>
                  <Badge variant="outline" className="h-4 px-1 text-[10px] opacity-70">
                    v{entry.version}
                  </Badge>
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    v2
                  </Badge>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{entry.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => onReset(entry.id)}
                  title="Reset all settings to declared defaults"
                  className={v2FocusRing}
                >
                  Reset
                </Button>
                <Switch
                  checked={entry.enabled}
                  onCheckedChange={(checked) => onToggle(entry.id, checked)}
                  aria-label={`${entry.enabled ? "Disable" : "Enable"} ${entry.name}`}
                />
              </div>
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap gap-1.5" aria-label="Permissions">
              {entry.declaredPermissions.length === 0 ? (
                <span className="text-[11px] text-zinc-600">No permissions declared.</span>
              ) : (
                entry.declaredPermissions.map((permission) => {
                  const granted = entry.effectivePermissions.includes(permission);
                  return (
                    <Badge
                      key={permission}
                      variant={granted ? "secondary" : "outline"}
                      className={cn(
                        "h-5 px-1.5 font-mono text-[10px]",
                        granted ? "" : "border-destructive/40 text-destructive",
                      )}
                      title={
                        granted
                          ? `Permission "${permission}" is granted; the host authorizes each operation.`
                          : `Permission "${permission}" is declared but not granted; commands needing it stay disabled with a reason.`
                      }
                    >
                      {permission}
                    </Badge>
                  );
                })
              )}
            </div>
            {denied.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-[11px] text-zinc-500">
                  {denied.length} declared permission(s) not granted — affected commands show why
                  they are unavailable instead of failing.
                </p>
                {onApprove ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => onApprove(entry.id, entry.declaredPermissions)}
                    className={v2FocusRing}
                  >
                    Approve all
                  </Button>
                ) : null}
              </div>
            ) : null}
            <div className={cn("mt-3 divide-y divide-white/5 border-y border-white/5", !entry.enabled && "opacity-50")}>
              {entry.rows.length === 0 ? (
                <p className="px-3 py-3 text-xs text-zinc-600">No settings declared.</p>
              ) : (
                entry.rows.map((row) => (
                  <V2SettingControl
                    key={row.declaration.id}
                    extensionId={entry.id}
                    row={row}
                    disabled={!entry.enabled}
                    onUpdate={(settingId, value) => onUpdateSetting(entry.id, settingId, value)}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
