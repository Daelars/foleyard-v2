import fs from "node:fs";

import { describe, expect, it } from "vitest";

// Token law (#16) is binding: the ratified visual-language values live in the
// shared theme layer, and ported surfaces carry no hard-coded accent values.
// This repo has no headless browser, so pixels can't be asserted; this guard
// locks the rule at its source instead — the same shape as the root-height
// guard. It grows as later slices port more surfaces.
describe("theme token law", () => {
  const globals = fs.readFileSync(
    new URL("./globals.css", import.meta.url),
    "utf8",
  );

  it("defines the ratified accent and canvas tokens in the theme layer", () => {
    for (const token of [
      "--accent-fill: #f0503c",
      "--accent-fill-hover: #ff5a44",
      "--accent-text: #ff7a66",
      "--canvas: #0b0b10",
      "--shell: #101014",
    ]) {
      expect(globals, `theme layer must define ${token}`).toContain(token);
    }
  });

  it("registers the accent tokens as Tailwind color utilities", () => {
    for (const token of [
      "--color-accent-fill:",
      "--color-accent-fill-hover:",
      "--color-accent-text:",
      "--color-canvas:",
      "--color-shell:",
    ]) {
      expect(globals, `@theme must register ${token}`).toContain(token);
    }
  });

  it("keeps hard-coded accent hex values out of the ported app surface", () => {
    const page = fs.readFileSync(
      new URL("./page.tsx", import.meta.url),
      "utf8",
    );
    for (const hex of [/#f0503c/i, /#ff5a44/i, /#ff7a66/i]) {
      expect(page, `page.tsx must not hard-code ${hex.source}`).not.toMatch(hex);
    }
  });

  // Consistency sweep (#33): no inventoried surface carries old-skin tokens.
  // Overlays keep their popover/shell backgrounds; everything else reads zinc,
  // white/10 outlines, white/5 dividers, and the accent-fill utilities.
  it("keeps old-skin tokens out of every inventoried surface", () => {
    const surfaces = [
      "./page.tsx",
      "../components/Sidebar.tsx",
      "../components/SoundShelf.tsx",
      "../components/ExtensionGrid.tsx",
      "../components/SettingsDialog.tsx",
      "../components/OnboardingDialog.tsx",
      "../components/DesktopTitleBar.tsx",
      "../components/UpdateNotifier.tsx",
      "../components/TagPicker.tsx",
      "../components/FileTable/file-row.tsx",
      "../components/AudioPlayer/collection-menu.tsx",
      "../components/AudioPlayer/player-shell.tsx",
      "../components/extensions/folder-janitor/FolderJanitorDialog.tsx",
      "../components/extensions/library-gatherer/LibraryGathererDialog.tsx",
      "../components/extensions/make-pack/MakePackDialog.tsx",
      "../components/extensions/rename-hammer/RenameHammerDialog.tsx",
      "../components/ui/accordion.tsx",
      "../components/ui/alert.tsx",
      "../components/ui/audio-player.tsx",
      "../components/ui/badge.tsx",
      "../components/ui/button.tsx",
      "../components/ui/card.tsx",
      "../components/ui/context-menu.tsx",
      "../components/ui/dropdown-menu.tsx",
      "../components/ui/radio-group.tsx",
      "../components/ui/select.tsx",
      "../components/ui/slider.tsx",
      "../components/ui/table.tsx",
      "../components/ui/tabs.tsx",
      "../components/ui/tooltip.tsx",
    ];
    const banned = [
      "muted-foreground",
      "border-border",
      "bg-card",
      "bg-muted",
      "text-foreground",
      "bg-accent/",
      "text-accent-foreground",
      "hover:bg-accent/",
      "bg-primary",
      "text-primary",
      "border-primary",
    ];
    for (const surface of surfaces) {
      const source = fs.readFileSync(new URL(surface, import.meta.url), "utf8");
      for (const token of banned) {
        expect(
          source,
          `${surface} must not carry old-skin token ${token}`,
        ).not.toContain(token);
      }
    }
  });
});
