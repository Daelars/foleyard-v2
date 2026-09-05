"use client";

import { useState } from "react";
import { Layers, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { Input } from "@/components/ui/input";

import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { Switch } from "@/components/ui/switch";

import type { ExtensionGridItem } from "@/lib/extensions/types";

import { getSettingPreview } from "@/lib/extensions/setting-previews";
import type { ExtensionsTabProps } from "./types";

export function ExtensionsTab({ extensions, onToggleExtension, onUpdateExtensionSetting }: ExtensionsTabProps) {
  const [expandedExtensionId, setExpandedExtensionId] = useState<string | null>(null);

  return (
          <TabsContent value="extensions" className="m-0 flex-1 p-6 outline-none">
            <div className="w-full space-y-8">
              <div>
                <h3 className="text-3xl font-bold tracking-tight text-zinc-50">Extension management</h3>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Enable or disable workflow tools and third-party integrations.
                </p>
              </div>

              <div className="divide-y divide-white/5 border-y border-white/10">
                {extensions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center">
                    <Layers className="size-12 opacity-10 mb-4" />
                    <p className="text-sm font-medium text-zinc-200">No extensions installed</p>
                    <p className="text-xs text-zinc-500 mt-1 max-w-[240px]">
                      Extensions allow you to add custom commands and workflows to Foleyard.
                    </p>
                  </div>
                ) : (
                  extensions.map((ext) => {
                    const hasSettings = Boolean(ext.settings?.length);
                    const isExpanded = expandedExtensionId === ext.id;

                    return (
                      <Collapsible
                        key={ext.id}
                        open={hasSettings ? isExpanded : false}
                        onOpenChange={(open) =>
                          setExpandedExtensionId(open ? ext.id : null)
                        }
                        className="transition-colors"
                      >
                        <div
                          className={cn(
                            "flex items-center gap-4 px-4 py-4 transition-colors hover:bg-white/5 sm:px-5",
                            isExpanded && "bg-white/5",
                          )}
                        >
                          {hasSettings ? (
                            <CollapsibleTrigger
                              render={
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-lg text-left outline-none transition-colors hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                  aria-label={`${isExpanded ? "Hide" : "Show"} ${ext.name} settings`}
                                >
                                  <div className="flex min-w-0 items-center gap-4">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-fill/12 font-bold text-accent-text">
                                      {ext.name.slice(0, 1).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="truncate text-sm font-semibold text-zinc-100">{ext.name}</p>
                                        <Badge variant="outline" className="h-4 px-1 text-[10px] opacity-70">
                                          v{ext.version}
                                        </Badge>
                                        <Badge variant="secondary" className="hidden h-4 px-1 text-[10px] sm:inline-flex">
                                          {ext.settings?.length} settings
                                        </Badge>
                                      </div>
                                      <p className="max-w-[300px] truncate text-xs text-zinc-500">
                                        {ext.description}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <ChevronDown
                                      data-icon="inline-start"
                                      className={cn(
                                        "transition-transform",
                                        isExpanded && "rotate-180",
                                      )}
                                    />
                                  </div>
                                </button>
                              }
                            />
                          ) : (
                            <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                              <div className="flex min-w-0 items-center gap-4">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-fill/12 font-bold text-accent-text">
                                  {ext.name.slice(0, 1).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate text-sm font-semibold text-zinc-100">{ext.name}</p>
                                    <Badge variant="outline" className="h-4 px-1 text-[10px] opacity-70">
                                      v{ext.version}
                                    </Badge>
                                  </div>
                                  <p className="max-w-[300px] truncate text-xs text-zinc-500">
                                    {ext.description}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                          <Switch
                            checked={ext.enabled}
                            onCheckedChange={(checked) => onToggleExtension?.(ext.id, checked)}
                          />
                        </div>

                        {hasSettings ? (
                          <CollapsibleContent keepMounted className="px-4 pb-5 sm:px-5">
                            <div className="border-t border-white/5 pt-4">
                              <div className="flex flex-col divide-y divide-white/5 border-y border-white/5">
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
                          </CollapsibleContent>
                        ) : null}
                      </Collapsible>
                    );
                  })
                )}
              </div>
            </div>
          </TabsContent>
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
    <div className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_220px] sm:items-center">
      <div className="min-w-0">
        <label htmlFor={inputId} className="text-sm font-medium text-zinc-100">
          {setting.label}
        </label>
        {setting.description ? (
          <p className="mt-0.5 text-xs text-zinc-500">
            {setting.description}
          </p>
        ) : null}
      </div>

      {setting.type === "boolean" ? (
        <div className="flex justify-start sm:justify-end">
          <Switch
            id={inputId}
            disabled={disabled}
            checked={Boolean(setting.value)}
            onCheckedChange={(checked) =>
              onUpdate?.(extensionId, setting.id, checked)
            }
          />
        </div>
      ) : setting.type === "select" ? (
        <select
          id={inputId}
          disabled={disabled}
          value={String(setting.value ?? setting.defaultValue ?? "")}
          onChange={(event) =>
            onUpdate?.(extensionId, setting.id, event.target.value)
          }
          className="h-8 rounded-lg border border-white/10 bg-black/30 px-2 text-sm text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {setting.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <Input
            id={inputId}
            disabled={disabled}
            type={setting.type === "number" ? "number" : "text"}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
          />
          {preview ? (
            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Preview
              </p>
              <p
                className={cn(
                  "mt-1 truncate font-mono text-sm",
                  preview.valid ? "text-zinc-200" : "text-destructive",
                )}
              >
                {preview.output}
              </p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
