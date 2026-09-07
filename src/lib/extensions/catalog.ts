import {
  describeYardCommand,
  type YardCommandDescription,
  type YardExtensionManifest,
} from "@yard-core";

/**
 * Serializable extension catalog projection.
 * Feature status: shipped. Contract: internal.
 * Derives full command descriptions from registered manifests without
 * executing handlers or leaking functions/validators into JSON.
 */

export type CatalogCommandDescription = YardCommandDescription & {
  extensionId: string;
};

export type CatalogExtensionEntry = {
  id: string;
  name: string;
  provider: string;
  version: string;
  source: "bundled";
  description: string;
  category: string;
  registered: boolean;
  enabled: boolean;
  contract: "internal";
  apiVersion: number;
  requestedPermissions: string[];
  permissionModel: "trusted-declarations" | "host-enforced";
  commandIds: string[];
  commands: CatalogCommandDescription[];
  declaredSurfaces: string[];
  docsId: string;
};

export function projectCatalogEntry(
  manifest: YardExtensionManifest,
  opts: { enabled: boolean; permissionModel?: CatalogExtensionEntry["permissionModel"] },
): CatalogExtensionEntry {
  return {
    id: manifest.id,
    name: manifest.name,
    provider: manifest.provider,
    version: manifest.version,
    source: "bundled",
    description: manifest.description,
    category: manifest.category,
    registered: true,
    enabled: opts.enabled,
    contract: "internal",
    apiVersion: 1,
    requestedPermissions: [...manifest.permissions],
    permissionModel: opts.permissionModel ?? "host-enforced",
    commandIds: manifest.commands.map((c) => c.id),
    commands: manifest.commands.map((c) => ({
      extensionId: manifest.id,
      ...describeYardCommand(c),
    })),
    declaredSurfaces: manifest.surfaces ? [...manifest.surfaces] : [],
    docsId: "extensions",
  };
}

/** Ensure JSON-safe (no functions) — throws on function leakage. */
export function assertSerializableCatalog(entry: CatalogExtensionEntry): void {
  const seen = JSON.stringify(entry);
  if (typeof seen !== "string") throw new Error("catalog entry is not serializable");
  if (/handler|validate/.test(seen) && /function/.test(seen)) {
    throw new Error("catalog entry leaks functions");
  }
}
