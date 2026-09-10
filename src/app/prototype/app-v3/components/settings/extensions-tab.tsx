"use client";

import { useState } from "react";
import { Layers, ChevronDown } from "lucide-react";

import { Field, Select, SettingRow, Switch } from "@/components/variant-i";

import { cn } from "@/lib/utils";

import type { ExtensionGridItem } from "@/lib/extensions/types";

import { getSettingPreview } from "@/lib/extensions/setting-previews";
import type { ExtensionsTabProps } from "@/components/settings/types";

export function V3SettingsExtensionsTab({ extensions, onToggleExtension, onUpdateExtensionSetting, v2Settings }: ExtensionsTabProps & { v2Settings?: React.ReactNode }) {
  const [expandedExtensionId, setExpandedExtensionId] = useState<string | null>(null);

  return (
    <div className="w-full space-y-8">
      <div>
        <h3 className="text-2xl font-bold tracking-tight text-zinc-50">Extension management</h3>
        <p className="mt-1 text-[13px] text-zinc-500">
          Enable or disable workflow tools and third-party integrations.
        </p>
      </div>

      <div className="divide-y divide-white/[0.06] border-y border-[var(--vi-edge)]">
        {extensions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <span
              aria-hidden
              className="grid size-11 place-items-center rounded-xl border border-[var(--vi-edge)] bg-white/[0.03] text-zinc-500 shadow-[var(--vi-lift)] [&_svg]:size-5"
            >
              <Layers />
            </span>
            <p className="mt-3 text-sm font-medium text-zinc-100">No extensions installed</p>
            <p className="mt-1 max-w-[240px] text-xs text-zinc-500">
              Extensions allow you to add custom commands and workflows to Foleyard.
            </p>
          </div>
        ) : (
          extensions.map((ext) => {
            const hasSettings = Boolean(ext.settings?.length);
            const isExpanded = expandedExtensionId === ext.id;

            return (
              <div
                key={ext.id}
                className={cn("transition-colors", isExpanded && "bg-white/[0.03]")}
              >
                <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
                  {hasSettings ? (
                    <button
                      type="button"
                      aria-label={`${isExpanded ? "Hide" : "Show"} ${ext.name} settings`}
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedExtensionId(isExpanded ? null : ext.id)
                      }
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)] hover:text-zinc-100"
                    >
                      <ExtensionRowContent ext={ext} hasSettings={hasSettings} />
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-zinc-500 transition-transform duration-200 motion-reduce:transition-none",
                          isExpanded && "rotate-180 text-accent-text",
                        )}
                      />
                    </button>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center">
                      <ExtensionRowContent ext={ext} hasSettings={hasSettings} />
                    </div>
                  )}
                  <Switch
                    label={`Toggle ${ext.name}`}
                    checked={ext.enabled}
                    onCheckedChange={(checked) => onToggleExtension?.(ext.id, checked)}
                  />
                </div>

                {hasSettings ? (
                  <div className="px-3 pb-4 sm:px-4">
                    <div className="border-t border-[var(--vi-edge)] pt-3">
                      <div className="flex flex-col gap-2">
                        {ext.settings?.map((setting) => (
                          <ExtensionSettingControl
                            key={`${setting.id}-${String(setting.value ?? setting.defaultValue ?? "")}`}
                            extensionId={ext.id}
                            setting={setting}
                            disabled={false}
                            onUpdate={onUpdateExtensionSetting}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {v2Settings}
    </div>
  );
}
function ExtensionRowContent({ ext, hasSettings }: { ext: ExtensionGridItem; hasSettings: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-lg border border-[color-mix(in_oklab,var(--accent-fill)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] text-[15px] font-bold text-accent-text"
      >
        {ext.name.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold text-zinc-100">{ext.name}</p>
          <span className="shrink-0 rounded border border-[var(--vi-edge)] px-1 font-mono text-[10px] text-zinc-500">
            v{ext.version}
          </span>
          {hasSettings ? (
            <span className="hidden shrink-0 rounded border border-[var(--vi-edge)] bg-white/[0.03] px-1 font-mono text-[10px] text-zinc-500 min-[420px]:block">
              {ext.settings?.length} settings
            </span>
          ) : null}
        </div>
        <p className="max-w-[300px] truncate text-xs text-zinc-500">
          {ext.description}
        </p>
      </div>
    </div>
  );
}
type ExtensionSetting = NonNullable<ExtensionGridItem["settings"]>[number];
function ExtensionSettingControl({
  disabled,
  extensionId,
  onUpdate,
  setting,
}: {
  disabled: boolean;
  extensionId: string;
  onUpdate?: (extensionId: string, settingId: string, value: unknown) => void;
  setting: ExtensionSetting;
}) {
  const inputId = `extension-${extensionId}-${setting.id}`;
  const [draft, setDraft] = useState(
    String(setting.value ?? setting.defaultValue ?? ""),
  );
  const preview =
    setting.type === "string" || setting.type === "path"
      ? getSettingPreview(extensionId, setting.id, draft)
      : null;

  const commitDraft = () => {
    const value =
      setting.type === "number" ? Number.parseFloat(draft) : draft;
    onUpdate?.(extensionId, setting.id, value);
  };

  return (
    <SettingRow title={setting.label} description={setting.description}>
      {setting.type === "boolean" ? (
        <Switch
          label={setting.label}
          checked={Boolean(setting.value)}
          onCheckedChange={(checked) => onUpdate?.(extensionId, setting.id, checked)}
        />
      ) : setting.type === "select" ? (
        <Select
          label={setting.label}
          value={String(setting.value ?? setting.defaultValue ?? "")}
          onChange={(value) =>
            onUpdate?.(extensionId, setting.id, value)
          }
          options={
            setting.options?.map((option) => ({
              value: option.value,
              label: option.label,
            })) ?? []
          }
        />
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <Field
            id={inputId}
            disabled={disabled}
            type={setting.type === "number" ? "number" : "text"}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            aria-label={setting.label}
          />
          {preview ? (
            <div className="rounded-lg border border-[var(--vi-edge)] bg-black/30 px-3 py-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Preview
              </p>
              <p
                className={cn(
                  "mt-1 truncate font-mono text-sm",
                  preview.valid ? "text-zinc-200" : "text-accent-text",
                )}
              >
                {preview.output}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </SettingRow>
  );
}