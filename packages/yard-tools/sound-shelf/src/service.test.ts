import { describe, it, expect, beforeEach } from "vitest";
import type { YardExtensionContext, PermissionChecker } from "yard-core";

import { SoundShelfService } from "./service";

function createMockContext(fileIds: string[] = []): YardExtensionContext {
  const permissions: PermissionChecker = {
    has: (perm) => perm === "library:read",
    require: (perm) => {
      if (perm !== "library:read") {
        throw new Error(`Missing permission: ${perm}`);
      }
    },
    list: () => ["library:read"],
  };

  return {
    services: {
      commands: {
        register: () => {},
      },
    } as unknown as YardExtensionContext["services"],
    selection: {
      fileIds,
    },
    permissions,
  } as unknown as YardExtensionContext;
}

describe("SoundShelfService", () => {
  let context: YardExtensionContext;
  let service: InstanceType<typeof SoundShelfService>;

  beforeEach(() => {
    context = createMockContext();
    service = new SoundShelfService(context);
    service.clear();
  });

  describe("addSelected", () => {
    it("should add selected files to the shelf", () => {
      context.selection.fileIds = ["file-1", "file-2"];

      const result = service.addSelected();

      expect(result.added).toBe(2);
      expect(result.remaining).toBe(2);
      expect(service.getItems()).toHaveLength(2);
    });

    it("should not add duplicates", () => {
      context.selection.fileIds = ["file-1", "file-2", "file-1"];

      const result = service.addSelected();

      expect(result.added).toBe(2);
      expect(result.remaining).toBe(2);
    });

    it("should handle empty selection", () => {
      context.selection.fileIds = [];

      const result = service.addSelected();

      expect(result.added).toBe(0);
      expect(result.remaining).toBe(0);
    });

    it("should require library:read permission", () => {
      context.permissions = {
        has: () => false,
        require: () => {
          throw new Error("Missing permission: library:read");
        },
        list: () => [],
      } as unknown as PermissionChecker;

      service = new SoundShelfService(context);

      expect(() => service.addSelected()).toThrow(
        "Missing permission: library:read",
      );
    });
  });

  describe("removeSelected", () => {
    it("should remove selected files from the shelf", () => {
      context.selection.fileIds = ["file-1", "file-2", "file-3"];
      service.addSelected();

      context.selection.fileIds = ["file-1", "file-3"];
      const result = service.removeSelected();

      expect(result.removed).toBe(2);
      expect(result.remaining).toBe(1);
      expect(service.contains("file-2")).toBe(true);
      expect(service.contains("file-1")).toBe(false);
    });

    it("should handle removing files not in shelf", () => {
      context.selection.fileIds = ["file-1"];
      service.addSelected();

      context.selection.fileIds = ["file-999"];
      const result = service.removeSelected();

      expect(result.removed).toBe(0);
      expect(result.remaining).toBe(1);
    });

    it("should handle empty selection", () => {
      context.selection.fileIds = ["file-1"];
      service.addSelected();

      context.selection.fileIds = [];
      const result = service.removeSelected();

      expect(result.removed).toBe(0);
      expect(result.remaining).toBe(1);
    });
  });

  describe("clear", () => {
    it("should remove all items from the shelf", () => {
      context.selection.fileIds = ["file-1", "file-2", "file-3"];
      service.addSelected();

      const result = service.clear();

      expect(result.removed).toBe(3);
      expect(result.remaining).toBe(0);
      expect(service.getItems()).toHaveLength(0);
    });

    it("should handle clearing an empty shelf", () => {
      const result = service.clear();

      expect(result.removed).toBe(0);
      expect(result.remaining).toBe(0);
    });
  });

  describe("contains", () => {
    it("should return true for files in the shelf", () => {
      context.selection.fileIds = ["file-1"];
      service.addSelected();

      expect(service.contains("file-1")).toBe(true);
    });

    it("should return false for files not in the shelf", () => {
      expect(service.contains("file-999")).toBe(false);
    });
  });

  describe("getItems", () => {
    it("should return a copy of shelf items", () => {
      context.selection.fileIds = ["file-1"];
      service.addSelected();

      const items = service.getItems();
      items.pop();

      expect(service.getItems()).toHaveLength(1);
    });
  });
});
