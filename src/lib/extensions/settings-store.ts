import { eq } from "drizzle-orm";

import { db } from "@/lib/database/connection";
import * as schema from "@/lib/schema";

function getSettingKey(extensionId: string, settingId: string) {
  return `extension:${extensionId}:setting:${settingId}`;
}

export function getExtensionSettingValue(
  extensionId: string,
  settingId: string,
  defaultValue: unknown,
) {
  const row = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, getSettingKey(extensionId, settingId)))
    .get();

  if (!row?.value) {
    return defaultValue;
  }

  try {
    return JSON.parse(row.value);
  } catch {
    return defaultValue;
  }
}

export function setExtensionSettingValue(
  extensionId: string,
  settingId: string,
  value: unknown,
) {
  const key = getSettingKey(extensionId, settingId);
  const serializedValue = JSON.stringify(value);
  const updatedAt = new Date().toISOString();

  db.insert(schema.settings)
    .values({
      key,
      value: serializedValue,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: {
        value: serializedValue,
        updatedAt,
      },
    })
    .run();
}
