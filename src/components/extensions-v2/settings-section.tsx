"use client";

import { useV2ExtensionEntries } from "@/components/extensions-v2/use-v2-extension-entries";
import { V2ExtensionSettings } from "./settings";

/**
 * Live v2 settings section for the Settings dialog (Application
 * context, R8). Wires the generic `V2ExtensionSettings` renderer to
 * the real routes: enable/disable (PATCH), validated setting writes
 * (PUT) and resets (POST reset), and explicit permission approval
 * (POST approvals). Registration stays server-side; this section
 * only sequences endpoints and refreshes after every write.
 */
export function V2ExtensionsSection() {
  const { entries, loading, error, toggle, updateSetting, reset, approve } =
    useV2ExtensionEntries();

  if (loading) {
    return <p className="p-6 text-center text-xs text-zinc-500">Loading v2 extensions…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="p-6 text-center text-xs text-destructive">
        {error}
      </p>
    );
  }
  return (
    <V2ExtensionSettings
      entries={entries}
      onToggle={(id, enabled) => void toggle(id, enabled)}
      onUpdateSetting={(id, settingId, value) => void updateSetting(id, settingId, value)}
      onReset={(id) => void reset(id)}
      onApprove={(id, permissions) => void approve(id, permissions)}
    />
  );
}
