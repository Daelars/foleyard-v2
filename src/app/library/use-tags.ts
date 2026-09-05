"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { resolveItemColor } from "@/lib/item-colors";
import type { TagRecord } from "./types";

/** Optimistic delete: drop the tag, keeping every other tag untouched. */
export function removeTagOptimistic(
  tags: TagRecord[],
  tagId: string,
): TagRecord[] {
  return tags.filter((tag) => tag.id !== tagId);
}

/** Rollback for a failed delete: restore the snapshot in name order. */
export function restoreTag(
  tags: TagRecord[],
  deleted: TagRecord,
): TagRecord[] {
  if (tags.some((tag) => tag.id === deleted.id)) {
    return tags;
  }
  return [...tags, deleted].sort((a, b) => a.name.localeCompare(b.name));
}

export function renameTagOptimistic(
  tags: TagRecord[],
  tagId: string,
  name: string,
): TagRecord[] {
  return tags.map((tag) =>
    tag.id === tagId ? { ...tag, name: name.trim() } : tag,
  );
}

export function recolorTag(
  tags: TagRecord[],
  tagId: string,
  color: string,
): TagRecord[] {
  return tags.map((tag) =>
    tag.id === tagId ? { ...tag, color } : tag,
  );
}

/**
 * Tags slice: file-tag links own their remote state here. Every mutation
 * refetches only the tags slice — never collections, files, or the catalog.
 * This hook never writes another hook's state.
 */
export function useTags() {
  const [tags, setTags] = useState<TagRecord[]>([]);

  const tagsRef = useRef(tags);
  useEffect(() => {
    tagsRef.current = tags;
  });

  const loadTags = useCallback(async () => {
    try {
      const res = await fetch("/api/tags");
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      setTags(
        ((data.tags ?? []) as TagRecord[]).map((tag) => ({
          ...tag,
          color: resolveItemColor(tag.name, tag.color),
        })),
      );
    } catch {
      // Sidebar keeps its last data.
    }
  }, []);

  const createTag = useCallback(
    async (name: string, color?: string) => {
      if (!name.trim()) {
        return null;
      }
      try {
        const res = await fetch("/api/tags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!res.ok) {
          throw new Error();
        }
        const data = (await res.json()) as { id?: string };
        if (color && data.id) {
          await fetch("/api/tags", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tagId: data.id, color }),
          });
        }
        void loadTags();
        toast.success("Tag created");
        return data.id ?? null;
      } catch {
        toast.error("Failed to create tag");
        return null;
      }
    },
    [loadTags],
  );

  const deleteTag = useCallback(async (tagId: string) => {
    const deleted = tagsRef.current.find((tag) => tag.id === tagId);
    setTags((current) => removeTagOptimistic(current, tagId));
    try {
      const res = await fetch("/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      });
      if (!res.ok) {
        throw new Error();
      }
      toast.success("Tag deleted");
    } catch {
      if (deleted) {
        setTags((current) => restoreTag(current, deleted));
      }
      toast.error("Failed to delete tag");
    }
  }, []);

  const renameTag = useCallback(
    async (tagId: string, name: string) => {
      if (!name.trim()) {
        return;
      }
      setTags((current) => renameTagOptimistic(current, tagId, name));
      try {
        const res = await fetch("/api/tags", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagId, name: name.trim() }),
        });
        if (!res.ok) {
          throw new Error();
        }
        toast.success("Tag renamed");
      } catch {
        void loadTags();
        toast.error("Failed to rename tag");
      }
    },
    [loadTags],
  );

  const updateTagColor = useCallback(
    async (tagId: string, color: string) => {
      setTags((current) => recolorTag(current, tagId, color));
      try {
        const res = await fetch("/api/tags", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tagId, color }),
        });
        if (!res.ok) {
          throw new Error();
        }
      } catch {
        void loadTags();
        toast.error("Failed to update tag color");
      }
    },
    [loadTags],
  );

  return {
    tags,
    loadTags,
    createTag,
    deleteTag,
    renameTag,
    updateTagColor,
  };
}
