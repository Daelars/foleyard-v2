export type SettingPreview = {
  output: string;
  valid: boolean;
};

export type SettingPreviewHook = (value: unknown) => SettingPreview;

const settingPreviewHooks = new Map<string, SettingPreviewHook>();

function previewKey(extensionId: string, settingId: string) {
  return `${extensionId}:${settingId}`;
}

export function registerSettingPreview(
  extensionId: string,
  settingId: string,
  hook: SettingPreviewHook,
): void {
  settingPreviewHooks.set(previewKey(extensionId, settingId), hook);
}

export function getSettingPreview(
  extensionId: string,
  settingId: string,
  value: unknown,
): SettingPreview | null {
  return settingPreviewHooks.get(previewKey(extensionId, settingId))?.(value) ?? null;
}

export function buildDropRulesRenamePreview(pattern: string): SettingPreview {
  const trimmedPattern = pattern.trim();

  if (!trimmedPattern) {
    return {
      output: "Pattern is empty",
      valid: false,
    };
  }

  const date = "2026-05-07";
  const time = "14-30-00";
  const output = trimmedPattern
    .replaceAll("{index}", "001")
    .replaceAll("{name}", "whoosh-rise")
    .replaceAll("{ext}", ".wav")
    .replaceAll("{format}", "wav")
    .replaceAll("{date}", date)
    .replaceAll("{time}", time);
  const cleanOutput = output.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-");

  return {
    output: cleanOutput || "001-whoosh-rise.wav",
    valid: Boolean(cleanOutput.trim()),
  };
}

registerSettingPreview("drop-rules", "rename-pattern", (value) =>
  buildDropRulesRenamePreview(typeof value === "string" ? value : ""),
);
