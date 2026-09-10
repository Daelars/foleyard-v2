import type { ContractStanding } from "@/lib/contract-types";

/**
 * Internal event catalog — only actually emitted/consumed contracts.
 * Feature status: shipped. Contract: internal.
 * UI intents are request/result protocol, not subscription events.
 * Entries with `transport: "callback"` are internal seams, never
 * subscriptions: they are listed so the guide and the runtime snapshot
 * agree on what exists.
 */

export type EventTransport = "ipc" | "renderer-local" | "callback";
export type EventOwner = "server" | "renderer" | "desktop";

export type EventDescription = {
  id: string;
  owner: EventOwner;
  transport: EventTransport;
  contract: ContractStanding;
  subscriptionAvailable: boolean;
  payloadRef?: string;
  docsId: string;
  description: string;
};

export const EVENT_CATALOG: EventDescription[] = [
  { id: "desktop:update-available", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, payloadRef: "UpdateInfo { version }", docsId: "events", description: "Main pushed updater available." },
  { id: "desktop:update-ready", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, payloadRef: "UpdateInfo { version }", docsId: "events", description: "Main pushed updater ready." },
  { id: "desktop:update-not-available", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, docsId: "events", description: "Main pushed no-update outcome; no payload." },
  { id: "desktop:update-error", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, payloadRef: "UpdateError { message }", docsId: "events", description: "Main pushed updater error." },
  { id: "desktop:update-download-progress", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, payloadRef: "UpdateProgress { percent, bytesPerSecond, transferred, total }", docsId: "events", description: "Main pushed download progress." },
  { id: "desktop:action-error", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, payloadRef: "message: string", docsId: "events", description: "Main pushed native-action error." },
  { id: "desktop:window-state", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, payloadRef: "DesktopWindowState { isMaximized }", docsId: "events", description: "Main pushed window maximize state." },
  { id: "sound-shelf:changed", owner: "renderer", transport: "renderer-local", contract: "internal", subscriptionAvailable: true, docsId: "events", description: "Renderer-local CustomEvent when shelf items change; no payload schema or cross-process propagation." },
  { id: "scan.progress", owner: "server", transport: "callback", contract: "internal", subscriptionAvailable: false, payloadRef: "status: ScanStatus", docsId: "events", description: "Optional ScanRunner progress callback; the app polls GET /api/scan instead. Not a subscription." },
  { id: "scan.complete", owner: "server", transport: "callback", contract: "internal", subscriptionAvailable: false, payloadRef: "{ startedAt: string; fileIds: string[] }", docsId: "events", description: "ScanRunner completion callback; run-scan.ts hands the arrivals to the auto-tag trigger." },
  { id: "job.transition", owner: "server", transport: "callback", contract: "internal", subscriptionAvailable: false, payloadRef: "V2JobRecord state change", docsId: "events", description: "V2JobManager transition callback: persists the snapshot and emits job-transition on the v2 bus. Progress stays memory-only." },
];

export function listEvents(): EventDescription[] {
  return EVENT_CATALOG.map((e) => ({ ...e }));
}
