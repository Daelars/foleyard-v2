import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { listEvents } from "./events";

// Area: #239. The catalog only contains emitted notifications or internal
// callbacks, and the guide lists exactly the same ids.

describe("event catalog", () => {
  it("has unique ids with an owner, transport and docs ref", () => {
    const events = listEvents();
    const ids = events.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const event of events) {
      expect(["server", "renderer", "desktop"]).toContain(event.owner);
      expect(["ipc", "renderer-local", "callback"]).toContain(event.transport);
      expect(event.docsId).toBe("events");
    }
  });

  it("does not catalogue callback seams as subscriptions", () => {
    for (const event of listEvents()) {
      if (event.transport === "callback") {
        expect(event.subscriptionAvailable, event.id).toBe(false);
      } else {
        expect(event.subscriptionAvailable, event.id).toBe(true);
      }
    }
  });

  it("matches the events guide ids", () => {
    const guide = fs.readFileSync(
      path.join(process.cwd(), "docs", "events.md"),
      "utf8",
    );
    const documented = new Set<string>();
    for (const line of guide.split("\n")) {
      const match = /^\|\s*`([^`]+)`\s*\|/.exec(line.trim());
      if (!match) continue;
      if (/^[a-z][a-z0-9-]*[.:][a-z0-9.-]+$/.test(match[1])) {
        documented.add(match[1]);
      }
    }
    expect([...documented].sort()).toEqual(
      listEvents()
        .map((event) => event.id)
        .sort(),
    );
  });
});
