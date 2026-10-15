import { describe, expect, it } from "vitest";

import { resolveV2UiIntent } from "@yard-core";
import {
  AUTO_TAG_V2_DOWNLOAD_MODEL,
  AUTO_TAG_V2_ID,
  AUTO_TAG_V2_MERGE_TAG,
  AUTO_TAG_V2_PREVIEW,
  AUTO_TAG_V2_REMOVE_BY_ORIGIN,
  createAutoTagV2Definition,
} from "@foleyard/auto-tag-v2";
import {
  DROP_RULES_V2_ID,
  createDropRulesV2Definition,
} from "@foleyard/drop-rules-v2";
import {
  FOLDER_JANITOR_V2_DELETE_FOLDERS,
  FOLDER_JANITOR_V2_ID,
  FOLDER_JANITOR_V2_SCAN_LIBRARY,
  createFolderJanitorV2Definition,
} from "@foleyard/folder-janitor-v2";
import {
  LIBRARY_GATHERER_V2_GATHER,
  LIBRARY_GATHERER_V2_ID,
  createLibraryGathererV2Definition,
} from "@foleyard/library-gatherer-v2";
import {
  MAKE_PACK_V2_ID,
  MAKE_PACK_V2_SOURCE_SELECTION,
  createMakePackV2Definition,
} from "@foleyard/make-pack-v2";
import {
  SMART_COLLECTIONS_V2_ID,
  SMART_COLLECTIONS_V2_SAVE_SEARCH,
  createSmartCollectionsV2Definition,
} from "@foleyard/smart-collections-v2";
import {
  SOUND_SHELF_V2_ID,
  createSoundShelfV2Definition,
} from "@foleyard/sound-shelf-v2";

import {
  routeV2Command,
  surfaceUnavailableReason,
  workflowForCommand,
} from "./command-surfaces";

// Area: #294 command surfaces. Every contribution declares the UI intent
// it needs; this routing decision maps that intent onto the real surface
// (a dedicated workspace, a review flow, or direct execution) so generic
// palette and context-menu actions never half-execute a command.

const BUNDLED_DEFINITIONS = [
  createSoundShelfV2Definition(),
  createMakePackV2Definition(),
  createFolderJanitorV2Definition(),
  createLibraryGathererV2Definition(),
  createSmartCollectionsV2Definition(),
  createDropRulesV2Definition(),
  createAutoTagV2Definition(),
];

describe("v2 command surface routing", () => {
  it("runs direct commands immediately", () => {
    const route = routeV2Command({
      extensionId: SOUND_SHELF_V2_ID,
      commandId: "sound-shelf-v2.list",
      ui: "direct",
      title: "List Shelf",
    });
    expect(route).toEqual({ kind: "direct" });
  });

  it("maps form-bearing commands onto their dedicated workflow", () => {
    const pack = routeV2Command({
      extensionId: MAKE_PACK_V2_ID,
      commandId: MAKE_PACK_V2_SOURCE_SELECTION,
      ui: "form",
      title: "Make Pack v2 from Selection",
    });
    expect(pack).toEqual({
      kind: "workflow",
      workflow: { kind: "make-pack", source: "selection" },
    });

    const gather = routeV2Command({
      extensionId: LIBRARY_GATHERER_V2_ID,
      commandId: LIBRARY_GATHERER_V2_GATHER,
      ui: "form",
      title: "Gather Library",
    });
    expect(gather).toEqual({
      kind: "workflow",
      workflow: { kind: "library-gatherer" },
    });

    const save = routeV2Command({
      extensionId: SMART_COLLECTIONS_V2_ID,
      commandId: SMART_COLLECTIONS_V2_SAVE_SEARCH,
      ui: "form",
      title: "Save Search as Smart Collection",
    });
    expect(save).toEqual({
      kind: "workflow",
      workflow: { kind: "save-search" },
    });
  });

  it("routes review and confirm commands to the surface that owns them", () => {
    expect(
      routeV2Command({
        extensionId: FOLDER_JANITOR_V2_ID,
        commandId: FOLDER_JANITOR_V2_DELETE_FOLDERS,
        ui: "review",
        title: "Delete Empty Folders",
      }),
    ).toEqual({
      kind: "workflow",
      workflow: { kind: "folder-janitor" },
    });

    expect(
      routeV2Command({
        extensionId: AUTO_TAG_V2_ID,
        commandId: AUTO_TAG_V2_DOWNLOAD_MODEL,
        ui: "confirm",
        title: "Download CLAP model",
      }),
    ).toEqual({
      kind: "workflow",
      workflow: { kind: "auto-tag", page: "coverage" },
    });
  });

  it("keeps the janitor scan inside its report workspace", () => {
    expect(
      routeV2Command({
        extensionId: FOLDER_JANITOR_V2_ID,
        commandId: FOLDER_JANITOR_V2_SCAN_LIBRARY,
        ui: "form",
        title: "Scan Library Mess",
      }),
    ).toEqual({
      kind: "workflow",
      workflow: { kind: "folder-janitor" },
    });
  });

  it("refuses, with a reason, a surface-bearing command that has no workflow", () => {
    const route = routeV2Command({
      extensionId: "third-party-tool",
      commandId: "third-party-tool.import",
      ui: "form",
      title: "Import from anywhere",
    });
    expect(route.kind).toBe("needs-surface");
    if (route.kind === "needs-surface") {
      expect(route.reason).toMatch(/form/i);
      expect(route.reason).toMatch(/Import from anywhere/);
      expect(route.reason).not.toMatch(/\bundefined\b/);
    }
  });

  it("describes each missing surface without blaming the user", () => {
    expect(surfaceUnavailableReason("form", "Import")).toMatch(/needs its form/i);
    expect(surfaceUnavailableReason("review", "Delete")).toMatch(/review/i);
    expect(surfaceUnavailableReason("confirm", "Download")).toMatch(
      /confirm/i,
    );
  });

  it("declares an explicit intent on every bundled command", () => {
    const missing: string[] = [];
    for (const definition of BUNDLED_DEFINITIONS) {
      for (const command of definition.commands) {
        if (command.ui === undefined) missing.push(command.id);
      }
    }
    expect(missing).toEqual([]);
  });

  it("gives every non-direct bundled command a workflow", () => {
    const orphans: string[] = [];
    for (const definition of BUNDLED_DEFINITIONS) {
      for (const command of definition.commands) {
        const intent = resolveV2UiIntent(command);
        if (intent === "direct") continue;
        if (!workflowForCommand(definition.id, command.id)) {
          orphans.push(`${definition.id}: ${command.id} needs ${intent}`);
        }
      }
    }
    expect(orphans).toEqual([]);
  });

  it("declares a non-direct intent for the commands that need a surface", () => {
    // Guard against regressing a surface-bearing command back to direct.
    const needsSurface = [
      [MAKE_PACK_V2_ID, MAKE_PACK_V2_SOURCE_SELECTION],
      [FOLDER_JANITOR_V2_ID, FOLDER_JANITOR_V2_SCAN_LIBRARY],
      [FOLDER_JANITOR_V2_ID, FOLDER_JANITOR_V2_DELETE_FOLDERS],
      [LIBRARY_GATHERER_V2_ID, LIBRARY_GATHERER_V2_GATHER],
      [SMART_COLLECTIONS_V2_ID, SMART_COLLECTIONS_V2_SAVE_SEARCH],
      [AUTO_TAG_V2_ID, AUTO_TAG_V2_PREVIEW],
      [AUTO_TAG_V2_ID, AUTO_TAG_V2_DOWNLOAD_MODEL],
      [AUTO_TAG_V2_ID, AUTO_TAG_V2_REMOVE_BY_ORIGIN],
      [AUTO_TAG_V2_ID, AUTO_TAG_V2_MERGE_TAG],
    ] as const;
    for (const [extensionId, commandId] of needsSurface) {
      const command = BUNDLED_DEFINITIONS.find((entry) => entry.id === extensionId)!
        .commands.find((entry) => entry.id === commandId)!;
      expect(resolveV2UiIntent(command), `${extensionId}: ${commandId}`).not.toBe(
        "direct",
      );
    }
  });

  it("leaves headless commands free of a surface requirement", () => {
    for (const commandId of [
      "sound-shelf-v2.list",
      "sound-shelf-v2.clear",
      "folder-janitor-v2.remove-files",
    ]) {
      const extensionId = commandId.split(".")[0]!;
      const command = BUNDLED_DEFINITIONS.find((entry) => entry.id === extensionId)!
        .commands.find((entry) => entry.id === commandId)!;
      expect(resolveV2UiIntent(command), commandId).toBe("direct");
    }
    // Drop Rules runs from the drop zone, which supplies the full context.
    expect(
      resolveV2UiIntent(
        createDropRulesV2Definition().commands.find(
          (command) => command.id === "drop-rules-v2.apply",
        )!,
      ),
    ).toBe("direct");
    expect(workflowForCommand(DROP_RULES_V2_ID, "drop-rules-v2.apply")).toBeNull();
  });
});
