import { describe, expect, it } from "vitest";

import type { FileTableDirectory } from "@/components/FileTable/types";
import {
  basename,
  getDirectorySubtitle,
  navigateToParent,
  navigateToRoot,
  navigateToSegment,
} from "./directory-navigation";

function makeCurrent(
  overrides: Partial<FileTableDirectory> = {},
): FileTableDirectory {
  return {
    key: JSON.stringify(["C:\\lib", "a/b"]),
    label: "b",
    libraryRoot: "C:\\lib",
    directory: "a/b",
    absolutePath: "C:\\lib/a/b",
    isRoot: false,
    showRoot: true,
    ...overrides,
  };
}

describe("basename", () => {
  it("reads the last segment across separators", () => {
    expect(basename("C:\\lib")).toBe("lib");
    expect(basename("/music/ambient")).toBe("ambient");
    expect(basename("C:\\lib")).toBe("C:\\lib".split(/[\\/]/).pop());
  });
});

describe("navigateToRoot", () => {
  it("builds the library-root descriptor preserving the current entry", () => {
    const current = makeCurrent();
    expect(navigateToRoot(current)).toEqual({
      ...current,
      key: JSON.stringify(["C:\\lib", null]),
      label: "lib",
      directory: null,
      absolutePath: "C:\\lib",
      isRoot: true,
    });
  });
});

describe("navigateToSegment", () => {
  it("builds the descriptor for one breadcrumb segment", () => {
    const current = makeCurrent();
    expect(navigateToSegment(current, ["a", "b"], 0)).toEqual({
      ...current,
      key: JSON.stringify(["C:\\lib", "a"]),
      label: "a",
      directory: "a",
      absolutePath: "C:\\lib/a",
      isRoot: false,
    });
  });
});

describe("navigateToParent", () => {
  it("returns null from a root entry so the table navigates to the library", () => {
    expect(
      navigateToParent(makeCurrent({ directory: null, isRoot: true })),
    ).toBeNull();
  });

  it("climbs one segment from a nested entry", () => {
    const parent = navigateToParent(makeCurrent());
    expect(parent).toEqual({
      ...makeCurrent(),
      key: JSON.stringify(["C:\\lib", "a"]),
      label: "a",
      directory: "a",
      absolutePath: "C:\\lib/a",
      isRoot: false,
    });
  });

  it("lands on the root descriptor from a first-level entry", () => {
    const parent = navigateToParent(
      makeCurrent({
        key: JSON.stringify(["C:\\lib", "a"]),
        label: "a",
        directory: "a",
        absolutePath: "C:\\lib/a",
      }),
    );
    expect(parent).toEqual({
      ...makeCurrent(),
      key: JSON.stringify(["C:\\lib", null]),
      label: "lib",
      directory: null,
      absolutePath: "C:\\lib",
      isRoot: true,
    });
  });

  it("returns null from a first-level entry when the root is hidden", () => {
    expect(
      navigateToParent(
        makeCurrent({
          key: JSON.stringify(["C:\\lib", "a"]),
          label: "a",
          directory: "a",
          absolutePath: "C:\\lib/a",
          showRoot: false,
        }),
      ),
    ).toBeNull();
  });
});

describe("getDirectorySubtitle", () => {
  it("shows the root path for roots and Folder otherwise", () => {
    expect(
      getDirectorySubtitle(makeCurrent({ isRoot: true })),
    ).toBe("C:\\lib");
    expect(getDirectorySubtitle(makeCurrent())).toBe("Folder");
  });
});
