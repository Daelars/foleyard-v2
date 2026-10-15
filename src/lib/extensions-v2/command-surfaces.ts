import type { ExtensionV2UiIntent } from "@yard-core";
import {
  FOLDER_JANITOR_V2_DELETE_FOLDERS,
  FOLDER_JANITOR_V2_ID,
  FOLDER_JANITOR_V2_SCAN_FOLDER,
  FOLDER_JANITOR_V2_SCAN_LIBRARY,
} from "@foleyard/folder-janitor-v2";
import {
  LIBRARY_GATHERER_V2_GATHER,
  LIBRARY_GATHERER_V2_ID,
  LIBRARY_GATHERER_V2_PREVIEW,
} from "@foleyard/library-gatherer-v2";
import {
  MAKE_PACK_V2_ID,
  MAKE_PACK_V2_SOURCE_RECENT,
  MAKE_PACK_V2_SOURCE_SELECTION,
  MAKE_PACK_V2_SOURCE_SHELF,
  type MakePackV2Source,
} from "@foleyard/make-pack-v2";
import {
  SMART_COLLECTIONS_V2_ID,
  SMART_COLLECTIONS_V2_SAVE_SEARCH,
} from "@foleyard/smart-collections-v2";
import {
  AUTO_TAG_V2_DISMISS_CANDIDATE,
  AUTO_TAG_V2_DOWNLOAD_MODEL,
  AUTO_TAG_V2_ID,
  AUTO_TAG_V2_MERGE_TAG,
  AUTO_TAG_V2_PREVIEW,
  AUTO_TAG_V2_PROMOTE_CANDIDATE,
  AUTO_TAG_V2_REMOVE_BY_ORIGIN,
  AUTO_TAG_V2_RENAME_TAG,
  AUTO_TAG_V2_TAG_SEMANTIC,
} from "@foleyard/auto-tag-v2";

/**
 * Command surface routing (Application context, #294).
 *
 * Every contributed command declares a UI intent in its definition
 * (`ExtensionV2UiIntent`). Generic surfaces — the command palette, the
 * file/folder context menus, and the selection bulk bar — must not
 * invoke a command that needs a form, a plan review, or a confirmation
 * with incomplete context. This module is the single, pure decision:
 *
 * - `direct` commands run immediately with the context at hand.
 * - `form`, `review`, and `confirm` commands route to the dedicated
 *   workspace that owns them (Make Pack, Folder Janitor, Library
 *   Gatherer, Smart Collections, Auto Tag).
 * - A surface-bearing command with no workspace on this surface is
 *   refused with a reason, never half-executed.
 *
 * The map is keyed by the owning extension and command IDs the packages
 * export, so a renamed command fails the routing test instead of
 * silently falling back to direct execution.
 */

export type V2Workflow =
  | { kind: "make-pack"; source: MakePackV2Source }
  | { kind: "folder-janitor" }
  | { kind: "library-gatherer" }
  | { kind: "save-search" }
  | { kind: "auto-tag"; page: "coverage" | "origins" };

export type V2CommandRoute =
  | { kind: "direct" }
  | { kind: "workflow"; workflow: V2Workflow }
  | { kind: "needs-surface"; reason: string };

type WorkflowLookup = Record<string, Record<string, V2Workflow>>;

const WORKFLOWS: WorkflowLookup = {
  [MAKE_PACK_V2_ID]: {
    [MAKE_PACK_V2_SOURCE_SELECTION]: {
      kind: "make-pack",
      source: "selection",
    },
    [MAKE_PACK_V2_SOURCE_SHELF]: { kind: "make-pack", source: "shelf" },
    [MAKE_PACK_V2_SOURCE_RECENT]: { kind: "make-pack", source: "recent" },
  },
  [FOLDER_JANITOR_V2_ID]: {
    [FOLDER_JANITOR_V2_SCAN_LIBRARY]: { kind: "folder-janitor" },
    [FOLDER_JANITOR_V2_SCAN_FOLDER]: { kind: "folder-janitor" },
    [FOLDER_JANITOR_V2_DELETE_FOLDERS]: { kind: "folder-janitor" },
  },
  [LIBRARY_GATHERER_V2_ID]: {
    [LIBRARY_GATHERER_V2_PREVIEW]: { kind: "library-gatherer" },
    [LIBRARY_GATHERER_V2_GATHER]: { kind: "library-gatherer" },
  },
  [SMART_COLLECTIONS_V2_ID]: {
    [SMART_COLLECTIONS_V2_SAVE_SEARCH]: { kind: "save-search" },
  },
  [AUTO_TAG_V2_ID]: {
    [AUTO_TAG_V2_PREVIEW]: { kind: "auto-tag", page: "coverage" },
    [AUTO_TAG_V2_PROMOTE_CANDIDATE]: { kind: "auto-tag", page: "coverage" },
    [AUTO_TAG_V2_DISMISS_CANDIDATE]: { kind: "auto-tag", page: "coverage" },
    [AUTO_TAG_V2_TAG_SEMANTIC]: { kind: "auto-tag", page: "coverage" },
    [AUTO_TAG_V2_DOWNLOAD_MODEL]: { kind: "auto-tag", page: "coverage" },
    [AUTO_TAG_V2_REMOVE_BY_ORIGIN]: { kind: "auto-tag", page: "origins" },
    [AUTO_TAG_V2_RENAME_TAG]: { kind: "auto-tag", page: "origins" },
    [AUTO_TAG_V2_MERGE_TAG]: { kind: "auto-tag", page: "origins" },
  },
};

/** The dedicated workspace a command opens, or null when it runs headless. */
export function workflowForCommand(
  extensionId: string,
  commandId: string,
): V2Workflow | null {
  return WORKFLOWS[extensionId]?.[commandId] ?? null;
}

/** Why a surface-bearing command cannot run from a generic entry point. */
export function surfaceUnavailableReason(
  ui: Exclude<ExtensionV2UiIntent, "direct">,
  label: string,
): string {
  switch (ui) {
    case "form":
      return `“${label}” needs its form; open it from its extension workspace instead.`;
    case "review":
      return `“${label}” needs a review before it runs; open it from its extension workspace.`;
    case "confirm":
      return `“${label}” needs confirmation; open it from its extension workspace.`;
  }
}

/**
 * Decide how a generic entry point should dispatch one command. Direct
 * commands run immediately; form/review/confirm commands open their
 * workspace; a surface-bearing command with no workspace is refused with
 * a reason.
 */
export function routeV2Command(input: {
  extensionId: string;
  commandId: string;
  ui: ExtensionV2UiIntent;
  title?: string;
}): V2CommandRoute {
  if (input.ui === "direct") return { kind: "direct" };
  const workflow = workflowForCommand(input.extensionId, input.commandId);
  if (workflow) return { kind: "workflow", workflow };
  return {
    kind: "needs-surface",
    reason: surfaceUnavailableReason(input.ui, input.title ?? input.commandId),
  };
}
