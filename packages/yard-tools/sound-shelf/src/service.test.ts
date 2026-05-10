import { describe, it, expect, beforeEach } from "vitest";
import type { YardExtensionContext, PermissionChecker } from "yard-core";

import { SoundShelfService } from "./service";
import { InMemorySoundShelfStore } from "./store";

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

function createService(context: YardExtensionContext) {
  return new SoundShelfService(context, new InMemorySoundShelfStore());
}

describe("SoundShelfService", () => {
  let context: YardExtensionContext;
  let service: InstanceType<typeof SoundShelfService>;

  beforeEach(() => {
    context = createMockContext();
    service = createService(context);
    service.clear();
  });

  describe("addSelected", () => {
    it("should add selected files to the shelf", () => {
      const result = service.addSelected(["file-1", "file-2"]);

      expect(result.added).toBe(2);
      expect(result.remaining).toBe(2);
      expect(service.getItems()).toHaveLength(2);
    });

    it("should not add duplicates", () => {
      const result = service.addSelected(["file-1", "file-2", "file-1"]);

      expect(result.added).toBe(2);
      expect(result.remaining).toBe(2);
    });

    it("should handle empty selection", () => {
      const result = service.addSelected([]);

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

      service = createService(context);

      expect(() => service.addSelected([])).toThrow(
        "Missing permission: library:read",
      );
    });
  });

  describe("removeSelected", () => {
    it("should remove selected files from the shelf", () => {
      service.addSelected(["file-1", "file-2", "file-3"]);

      const result = service.removeSelected(["file-1", "file-3"]);

      expect(result.removed).toBe(2);
      expect(result.remaining).toBe(1);
      expect(service.contains("file-2")).toBe(true);
      expect(service.contains("file-1")).toBe(false);
    });

    it("should handle removing files not in shelf", () => {
      service.addSelected(["file-1"]);

      const result = service.removeSelected(["file-999"]);

      expect(result.removed).toBe(0);
      expect(result.remaining).toBe(1);
    });

    it("should handle empty selection", () => {
      service.addSelected(["file-1"]);

      const result = service.removeSelected([]);

      expect(result.removed).toBe(0);
      expect(result.remaining).toBe(1);
    });
  });

  describe("clear", () => {
    it("should remove all items from the shelf", () => {
      service.addSelected(["file-1", "file-2", "file-3"]);

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
      service.addSelected(["file-1"]);

      expect(service.contains("file-1")).toBe(true);
    });

    it("should return false for files not in the shelf", () => {
      expect(service.contains("file-999")).toBe(false);
    });
  });

  describe("getItems", () => {
    it("should return a copy of shelf fileIds", () => {
      service.addSelected(["file-1"]);

      const items = service.getItems();
      items.pop();

      expect(service.getItems()).toHaveLength(1);
    });
  });
});
