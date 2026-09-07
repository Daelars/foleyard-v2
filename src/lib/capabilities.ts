import type { YardContractStanding, YardFeatureStatus } from "@yard-core";

/**
 * Implemented capability catalog.
 * Feature status: shipped. Contract: internal.
 * Capabilities describe supported operations; permissions describe access
 * policy; availability is derived from actual service/host composition.
 * Bundled Node extensions remain trusted code — service wrappers enforce
 * cooperative access but do not sandbox direct Node imports.
 */

export type CapabilityOwner = "server" | "renderer" | "desktop";

export type CapabilityAvailability =
  | { state: "available" }
  | { state: "unavailable"; reason: string }
  | { state: "unknown"; reason?: string };

export type CapabilityDescription = {
  id: string;
  owner: CapabilityOwner;
  title: string;
  featureStatus: YardFeatureStatus;
  contract: YardContractStanding;
  availability: CapabilityAvailability;
  requiredPermissions: string[];
  docsId: string;
};

export const CAPABILITIES: Omit<CapabilityDescription, "availability">[] = [
  { id: "library.read", owner: "server", title: "Read indexed library", featureStatus: "shipped", contract: "internal", requiredPermissions: ["library:read"], docsId: "library" },
  { id: "library.write", owner: "server", title: "Mutate indexed library", featureStatus: "shipped", contract: "internal", requiredPermissions: ["library:write"], docsId: "library" },
  { id: "files.read", owner: "server", title: "Read audio files within roots", featureStatus: "shipped", contract: "internal", requiredPermissions: ["files:read"], docsId: "filesystem" },
  { id: "files.write", owner: "server", title: "Write audio files to granted destinations", featureStatus: "shipped", contract: "internal", requiredPermissions: ["files:write"], docsId: "filesystem" },
  { id: "files.delete", owner: "server", title: "Delete files/folders (permanent, no recycle bin)", featureStatus: "shipped", contract: "internal", requiredPermissions: ["files:delete"], docsId: "filesystem" },
  { id: "collections.write", owner: "server", title: "Create and mutate collections", featureStatus: "shipped", contract: "internal", requiredPermissions: ["collections:write"], docsId: "collections" },
  { id: "shelf.read", owner: "server", title: "Read Sound Shelf scratchpad", featureStatus: "shipped", contract: "internal", requiredPermissions: ["library:read"], docsId: "collections" },
  { id: "shelf.write", owner: "server", title: "Mutate Sound Shelf scratchpad", featureStatus: "shipped", contract: "internal", requiredPermissions: ["library:read"], docsId: "collections" },
  { id: "pack.export", owner: "server", title: "Export packs to granted destinations", featureStatus: "shipped", contract: "internal", requiredPermissions: ["files:read", "files:copy", "files:write"], docsId: "commands" },
  { id: "gather.preview", owner: "server", title: "Preview library gather", featureStatus: "shipped", contract: "internal", requiredPermissions: ["library:read"], docsId: "commands" },
  { id: "gather.write", owner: "server", title: "Gather files into library", featureStatus: "shipped", contract: "internal", requiredPermissions: ["library:read", "library:write", "files:read", "files:copy", "files:write"], docsId: "commands" },
  { id: "janitor.scan", owner: "server", title: "Scan for library mess", featureStatus: "shipped", contract: "internal", requiredPermissions: ["library:read", "files:read"], docsId: "commands" },
  { id: "drop.apply", owner: "server", title: "Apply drop rules to staged files", featureStatus: "shipped", contract: "internal", requiredPermissions: ["files:read", "files:copy", "files:write", "drop:read", "drop:modify"], docsId: "filesystem" },
  { id: "drop.configure", owner: "server", title: "Configure drop rules", featureStatus: "shipped", contract: "internal", requiredPermissions: [], docsId: "filesystem" },
  { id: "scan.run", owner: "server", title: "Run library scan and metadata queue", featureStatus: "shipped", contract: "internal", requiredPermissions: [], docsId: "scanning" },
  { id: "playback.preview", owner: "renderer", title: "Preview audio in browser element", featureStatus: "shipped", contract: "internal", requiredPermissions: [], docsId: "playback" },
  { id: "waveform.view", owner: "server", title: "Generate and cache waveforms (FFmpeg for compressed)", featureStatus: "shipped", contract: "internal", requiredPermissions: [], docsId: "playback" },
  { id: "desktop.native", owner: "desktop", title: "Native file reveal, open, drag and picker", featureStatus: "shipped", contract: "internal", requiredPermissions: ["desktop:reveal", "desktop:open"], docsId: "architecture/desktop" },
];

export function describeCapabilities(opts: {
  hasServerServices: boolean;
  desktopAvailable: boolean;
}): CapabilityDescription[] {
  return CAPABILITIES.map((c) => {
    if (c.owner === "server") {
      return {
        ...c,
        availability: opts.hasServerServices
          ? { state: "available" as const }
          : { state: "unavailable" as const, reason: "server services not initialized" },
      };
    }
    if (c.owner === "desktop") {
      return {
        ...c,
        availability: opts.desktopAvailable
          ? { state: "available" as const }
          : { state: "unavailable" as const, reason: "not running in desktop mode" },
      };
    }
    return { ...c, availability: { state: "unknown" as const, reason: "renderer session not observed server-side" } };
  });
}
