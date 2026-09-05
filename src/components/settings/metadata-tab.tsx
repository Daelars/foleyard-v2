"use client";

import { useRef, useState } from "react";
import { Filter, ListMusic, Pencil, Plus, Tag as TagIcon, Trash2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { TabsContent } from "@/components/ui/tabs";

import type { MetadataTabProps } from "./types";

export function MetadataTab({ collections, tags, onCreateCollection, onDeleteCollection, onRenameCollection, onConvertToRegularCollection, onCreateTag, onDeleteTag }: MetadataTabProps) {
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<
    { kind: "collection" | "tag"; id: string } | null
  >(null);
  const collectionInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) return;

    await onCreateCollection(name);
    setNewCollectionName("");
  };

  const handleDeleteCollection = async (id: string) => {
    await onDeleteCollection(id);
    collectionInputRef.current?.focus();
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;

    await onCreateTag(name);
    setNewTagName("");
  };

  const handleDeleteTag = async (id: string) => {
    await onDeleteTag(id);
    tagInputRef.current?.focus();
  };

  return (
          <TabsContent value="metadata" className="m-0 flex-1 p-8 outline-none">
            <div className="mx-auto max-w-3xl space-y-10">
              <div>
                <h3 className="text-3xl font-bold tracking-tight text-zinc-50">Collections & tags</h3>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Manage library organization without leaving the settings panel.
                </p>
              </div>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                    <ListMusic className="size-4 text-accent-text" />
                    Collections
                  </h4>
                  <Badge variant="secondary" className="rounded-full px-2.5">
                    {collections.length}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Input
                    ref={collectionInputRef}
                    placeholder="Collection name"
                    value={newCollectionName}
                    onChange={(event) => setNewCollectionName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleCreateCollection();
                    }}
                    className="h-9 rounded-xl border-white/10 bg-black/30"
                  />
                  <Button
                    onClick={handleCreateCollection}
                    disabled={!newCollectionName.trim()}
                    className="h-9 rounded-lg px-4"
                  >
                    <Plus className="mr-1 size-4" />
                    Create
                  </Button>
                </div>

                <div className="divide-y divide-white/5 border-y border-white/10">
                  {collections.length === 0 ? (
                    <div className="py-8 text-center text-sm text-zinc-500">
                      No collections yet.
                    </div>
                  ) : (
                    collections.map((collection) => {
                      const isSmart = collection.isSmart ?? false;
                      return (
                        <div
                          key={collection.id}
                          className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-white/5"
                        >
                          {isSmart ? (
                            <Filter className="ml-1 size-4 shrink-0 text-zinc-500" />
                          ) : (
                            <ListMusic className="ml-1 size-4 shrink-0 text-zinc-500" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-zinc-100">
                              {collection.name}
                              {isSmart && (
                                <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 leading-tight align-middle">
                                  Smart
                                </Badge>
                              )}
                            </p>
                          </div>
                          <span className="font-mono text-xs text-zinc-500">
                            {collection.fileCount ?? 0}
                          </span>
                          {confirmingDelete?.kind === "collection" &&
                          confirmingDelete.id === collection.id ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 shrink-0 rounded-lg bg-destructive/15 px-3 text-xs font-semibold text-destructive transition-all hover:bg-destructive/25 active:scale-95"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  setConfirmingDelete(null);
                                  void handleDeleteCollection(collection.id);
                                }}
                              >
                                Sure?
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="mr-1 shrink-0 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => setConfirmingDelete(null)}
                                aria-label="Cancel delete"
                              >
                                <X className="size-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              {isSmart && onConvertToRegularCollection && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-zinc-500 opacity-0 transition-opacity hover:bg-white/5 hover:text-zinc-200 group-hover:opacity-100"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => onConvertToRegularCollection(collection.id)}
                                  aria-label={`Convert ${collection.name} to a regular collection`}
                                  title="Convert to regular collection"
                                >
                                  <ListMusic className="size-4" />
                                </Button>
                              )}
                              {onRenameCollection && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-zinc-500 opacity-0 transition-opacity hover:bg-white/5 hover:text-zinc-200 group-hover:opacity-100"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => onRenameCollection(collection.id, collection.name)}
                                  aria-label={`Rename ${collection.name}`}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="mr-1 text-zinc-500 opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => setConfirmingDelete({ kind: "collection", id: collection.id })}
                                aria-label={`Delete collection ${collection.name}`}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                    <TagIcon className="size-4 text-accent-text" />
                    Tags
                  </h4>
                  <Badge variant="secondary" className="rounded-full px-2.5">
                    {tags.length}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Input
                    ref={tagInputRef}
                    placeholder="New tag name"
                    value={newTagName}
                    onChange={(event) => setNewTagName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void handleCreateTag();
                    }}
                    className="h-9 rounded-xl border-white/10 bg-black/30"
                  />
                  <Button
                    onClick={handleCreateTag}
                    disabled={!newTagName.trim()}
                    className="h-9 rounded-lg px-4"
                  >
                    <Plus className="mr-1 size-4" />
                    Add
                  </Button>
                </div>

                <div className="divide-y divide-white/5 border-y border-white/10">
                  {tags.length === 0 ? (
                    <div className="py-8 text-center text-sm text-zinc-500">
                      No tags yet.
                    </div>
                  ) : (
                    tags.map((tag) => (
                      <div
                        key={tag.id}
                        className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-white/5"
                      >
                        <span
                          className="ml-1 size-2.5 shrink-0 rounded-full ring-1 ring-white/15"
                          style={{ backgroundColor: tag.color }}
                        />
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-100">
                          {tag.name}
                        </p>
                        {confirmingDelete?.kind === "tag" && confirmingDelete.id === tag.id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 shrink-0 rounded-lg bg-destructive/15 px-3 text-xs font-semibold text-destructive transition-all hover:bg-destructive/25 active:scale-95"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setConfirmingDelete(null);
                                void handleDeleteTag(tag.id);
                              }}
                            >
                              Sure?
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="mr-1 shrink-0 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => setConfirmingDelete(null)}
                              aria-label="Cancel delete"
                            >
                              <X className="size-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="mr-1 text-zinc-500 opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => setConfirmingDelete({ kind: "tag", id: tag.id })}
                            aria-label={`Delete tag ${tag.name}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </TabsContent>
  );
}
