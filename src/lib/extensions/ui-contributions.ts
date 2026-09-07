import type { YardContractStanding } from "@yard-core";

/**
 * Implemented UI contribution points.
 * Feature status: shipped. Contract: internal.
 * Distinguishes manifest surface requests from registered adapters.
 * Only settings controls, palette entries and UI intents are generic;
 * context menus are explicit JSX plus one minimal command adapter.
 */

export type ContributionKind = "command" | "setting" | "ui-intent" | "context-menu-item";
export type ContributionOwner = "renderer" | "server";

export type ExtensionPointDescription = {
  id: string;
  owner: ContributionOwner;
  contributionKind: ContributionKind;
  title: string;
  contract: YardContractStanding;
  availability: { state: "available" | "unavailable" | "unknown"; reason?: string };
  docsId: string;
};

export const EXTENSION_POINTS: ExtensionPointDescription[] = [
  { id: "palette.command", owner: "renderer", contributionKind: "command", title: "Command palette entries from enabled extensions", contract: "internal", availability: { state: "available" }, docsId: "commands" },
  { id: "settings.controls", owner: "renderer", contributionKind: "setting", title: "Generic extension settings controls", contract: "internal", availability: { state: "available" }, docsId: "settings" },
  { id: "ui-intent.dialog", owner: "renderer", contributionKind: "ui-intent", title: "Extension UI-intent to dialog/settings dispatch", contract: "internal", availability: { state: "available" }, docsId: "extensions" },
  { id: "context-menu.file-command", owner: "renderer", contributionKind: "context-menu-item", title: "Selected-file context-menu command adapter", contract: "internal", availability: { state: "available" }, docsId: "extensions" },
  { id: "sidebar.panel", owner: "renderer", contributionKind: "command", title: "Bespoke sidebar panels (not generic contributions)", contract: "internal", availability: { state: "unavailable", reason: "explicit app wiring only; surfaces do not mount panels" }, docsId: "extensions" },
  { id: "waveform.provider", owner: "renderer", contributionKind: "command", title: "Waveform provider", contract: "internal", availability: { state: "unavailable", reason: "no provider contract implemented" }, docsId: "extensions" },
  { id: "metadata.provider", owner: "server", contributionKind: "command", title: "Metadata provider", contract: "internal", availability: { state: "unavailable", reason: "no provider contract implemented" }, docsId: "extensions" },
  { id: "search.provider", owner: "server", contributionKind: "command", title: "Search provider", contract: "internal", availability: { state: "unavailable", reason: "no provider contract implemented" }, docsId: "extensions" },
];

export type ContextMenuCommandContribution = {
  id: string;
  extensionId: string;
  commandId: string;
  label: string;
  requiresSelection: boolean;
};

const contextMenuContributions = new Map<string, ContextMenuCommandContribution>();

/** Minimal context-menu command contribution adapter with cleanup. */
export function registerContextMenuCommand(contrib: ContextMenuCommandContribution): () => void {
  contextMenuContributions.set(contrib.id, { ...contrib });
  return () => {
    contextMenuContributions.delete(contrib.id);
  };
}

export function listContextMenuCommands(): ContextMenuCommandContribution[] {
  return Array.from(contextMenuContributions.values(), (c) => ({ ...c }));
}

export function clearContextMenuCommands(): void {
  contextMenuContributions.clear();
}

export function listExtensionPoints(): ExtensionPointDescription[] {
  return EXTENSION_POINTS.map((e) => ({ ...e, availability: { ...e.availability } }));
}
