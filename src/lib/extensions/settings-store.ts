import { readJsonSetting, writeJsonSetting } from "./kv-store";

function getSettingKey(extensionId: string, settingId: string) {
  return `extension:${extensionId}:setting:${settingId}`;
}

export function getExtensionSettingValue(extensionId: string, settingId: string, defaultValue: unknown) {
  return readJsonSetting(getSettingKey(extensionId, settingId), defaultValue);
}

export function setExtensionSettingValue(extensionId: string, settingId: string, value: unknown) {
  writeJsonSetting(getSettingKey(extensionId, settingId), value);
}
