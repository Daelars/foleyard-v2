import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { withGenerationSlot } from "./waveform-cache";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe("withGenerationSlot", () => {
  it("caps concurrency at two and drains every waiter", async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    const gate = (id: number) =>
      withGenerationSlot(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise<void>((resolve) => {
          releases.push(resolve);
        });
        active -= 1;
        return id;
      });

    const tasks = [gate(0), gate(1), gate(2), gate(3)];
    await tick();
    await tick();
    expect(active).toBe(2);
    expect(maxActive).toBe(2);

    for (let step = 0; step < 8 && releases.length > 0; step += 1) {
      releases.shift()!();
      await tick();
    }

    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2, 3]);
    expect(active).toBe(0);
    expect(maxActive).toBe(2);
  });

  it("releases the slot when work throws", async () => {
    await expect(
      withGenerationSlot(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(withGenerationSlot(async () => "recovered")).resolves.toBe(
      "recovered",
    );
  });
});

describe("waveform cache ignore rules", () => {
  it("keeps the on-disk cache directory out of git", () => {
    const gitignore = readFileSync(
      new URL("../../.gitignore", import.meta.url),
      "utf8",
    );
    expect(gitignore).toMatch(/\.waveform-cache/);
  });
});
