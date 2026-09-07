import type { YardContractStanding } from "@yard-core";

/**
 * Internal event catalog — only actually emitted/consumed contracts.
 * Feature status: shipped. Contract: internal.
 * UI intents are request/result protocol, not subscription events.
 */

export type EventTransport = "ipc" | "renderer-local" | "callback";
export type EventOwner = "server" | "renderer" | "desktop";

export type EventDescription = {
  id: string;
  owner: EventOwner;
  transport: EventTransport;
  contract: YardContractStanding;
  subscriptionAvailable: boolean;
  payloadRef?: string;
  docsId: string;
  description: string;
};

export const EVENT_CATALOG: EventDescription[] = [
  { id: "desktop:update-available", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, payloadRef: "UpdateInfo { version }", docsId: "events", description: "Main pushed updater available." },
  { id: "desktop:update-ready", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, payloadRef: "UpdateInfo { version }", docsId: "events", description: "Main pushed updater ready." },
  { id: "desktop:update-not-available", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, docsId: "events", description: "Main pushed no-update outcome." },
  { id: "desktop:update-error", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, payloadRef: "UpdateError { message }", docsId: "events", description: "Main pushed updater error." },
  { id: "desktop:update-download-progress", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, payloadRef: "UpdateProgress", docsId: "events", description: "Main pushed download progress." },
  { id: "desktop:action-error", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, docsId: "events", description: "Main pushed native-action error." },
  { id: "desktop:window-state", owner: "desktop", transport: "ipc", contract: "internal", subscriptionAvailable: true, payloadRef: "DesktopWindowState", docsId: "events", description: "Main pushed window maximize state." },
  { id: "sound-shelf:changed", owner: "renderer", transport: "renderer-local", contract: "internal", subscriptionAvailable: true, docsId: "events", description: "Renderer-local CustomEvent when shelf items change; no payload schema or cross-process propagation." },
  { id: "desktop-bridge-ready", owner: "renderer", transport: "renderer-local", contract: "internal", subscriptionAvailable: true, docsId: "events", description: "Renderer window event for late preload injection." },
  { id: "scan.progress", owner: "server", transport: "callback", contract: "internal", subscriptionAvailable: false, payloadRef: "ScanRunner onProgress callback + GET /api/scan polling", docsId: "events", description: "Optional scan progress callback; UI polls HTTP status. Not a public subscription." },
  { id: "extension.scan-progress", owner: "server", transport: "callback", contract: "internal", subscriptionAvailable: false, payloadRef: "services.scanProgress.report", docsId: "events", description: "Host factory callback; execute route supplies none." },
];

export function listEvents(): EventDescription[] {
  return EVENT_CATALOG.map((e) => ({ ...e }));
}
