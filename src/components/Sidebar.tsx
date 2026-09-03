"use client";

import { useCallback } from "react";
import { Filter, Folder, Heart, List, MoreVertical, Pencil, Settings, Activity, Puzzle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DotmSquare3 } from "@/components/ui/dotm-square-3";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface SidebarCollection {
  id: string;
  name: string;
  fileCount?: number;
  isSmart?: boolean;
  filter?: string | null;
}

interface SidebarProps {
  currentView: "all" | "favorites" | "extensions" | "collection" | "directory";
  collections: SidebarCollection[];
  selectedCollection: string | null;
  tags: { id: string; name: string; color: string }[];
  scanStatus: {
    phase: string;
    discovered: number;
    indexed?: number;
    metadataProcessed?: number;
    running: boolean;
  };
  className?: string;
  onOpenSettings: () => void;
  onSelectLibrary: () => void;
  onSelectFavorites: () => void;
  onSelectExtensions: () => void;
  onSelectCollection: (id: string) => void;
  onRenameCollection?: (id: string, name: string) => void;
  onConvertToRegularCollection?: (id: string) => void;
  onDeleteCollection?: (id: string) => void;
  onAction?: () => void;
}

export function Sidebar({
  currentView,
  collections,
  selectedCollection,
  tags,
  scanStatus,
  className,
  onOpenSettings,
  onSelectLibrary,
  onSelectFavorites,
  onSelectExtensions,
  onSelectCollection,
  onRenameCollection,
  onConvertToRegularCollection,
  onDeleteCollection,
  onAction,
}: SidebarProps) {
  const libraryActive = currentView === "all" || currentView === "directory";
  const favoritesActive = currentView === "favorites";
  const extensionsActive = currentView === "extensions";
  const scanComplete = !scanStatus.running && scanStatus.discovered > 0;
  const statusDetail = scanStatus.running
    ? scanStatus.phase === "metadata"
      ? `${scanStatus.metadataProcessed ?? 0} metadata enriched`
      : `${scanStatus.indexed ?? 0}/${scanStatus.discovered} files indexed`
    : scanStatus.discovered > 0
      ? `${scanStatus.indexed ?? scanStatus.discovered} files indexed`
      : "Ready to scan library";
  const sectionHeaderClass =
    "px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70";
  const navItemClass =
    "w-full justify-start gap-3 rounded-xl text-muted-foreground transition-[background-color,color,box-shadow] duration-200 hover:bg-accent/50 hover:text-accent-foreground";
  const activeNavItemClass =
    "bg-primary/10 text-primary shadow-[inset_3px_0_0_var(--primary)] hover:bg-primary/10 hover:text-primary";

  const handleSelectExtensions = useCallback(() => {
    onSelectExtensions();
    onAction?.();
  }, [onSelectExtensions, onAction]);

  const handleSelectLibrary = useCallback(() => {
    onSelectLibrary();
    onAction?.();
  }, [onSelectLibrary, onAction]);

  const handleSelectFavorites = useCallback(() => {
    onSelectFavorites();
    onAction?.();
  }, [onSelectFavorites, onAction]);

  const handleSelectCollection = useCallback((id: string) => {
    onSelectCollection(id);
    onAction?.();
  }, [onSelectCollection, onAction]);

  const handleRenameCollection = useCallback((id: string, name: string) => {
    onRenameCollection?.(id, name);
  }, [onRenameCollection]);

  const handleConvertToRegularCollection = useCallback((id: string) => {
    onConvertToRegularCollection?.(id);
  }, [onConvertToRegularCollection]);

  const handleDeleteCollection = useCallback((id: string) => {
    onDeleteCollection?.(id);
  }, [onDeleteCollection]);

  const handleOpenSettings = useCallback(() => {
    onOpenSettings();
    onAction?.();
  }, [onOpenSettings, onAction]);

  return (
    <aside
      className={cn(
        "relative flex w-64 shrink-0 flex-col overflow-hidden border-r border-border/40 bg-card/60 backdrop-blur-xl animate-in fade-in-0 slide-in-from-left-3 duration-300",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_36%)]" />
      <div className="relative flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight px-2">Foleyard</h2>
          {scanStatus.running && (
             <Activity className="size-4 text-primary animate-pulse" />
          )}
        </div>

        <div className="space-y-1 animate-in fade-in-0 slide-in-from-left-2 duration-300">
          <Button
            variant="ghost"
            className={cn(
              navItemClass,
              libraryActive && activeNavItemClass,
            )}
            onClick={handleSelectLibrary}
          >
            <List className={cn("size-4", libraryActive && "text-primary")} />
            Library
          </Button>
          <Button
            variant="ghost"
            className={cn(
              navItemClass,
              favoritesActive && activeNavItemClass,
            )}
            onClick={handleSelectFavorites}
          >
            <Heart className={cn("size-4", favoritesActive && "fill-current text-primary")} />
            Favorites
          </Button>
          <Button
            variant="ghost"
            className={cn(
              navItemClass,
              extensionsActive && activeNavItemClass,
            )}
            onClick={handleSelectExtensions}
          >
            <Puzzle className={cn("size-4", extensionsActive && "text-primary")} />
            Extensions
          </Button>
        </div>
      </div>

      <Separator className="relative mx-4 w-auto" />

      <ScrollArea className="relative flex-1">
        <div className="space-y-6 p-4">
          <section className="space-y-2">
            <h3 className={sectionHeaderClass}>
              Playlists
            </h3>
            <div className="space-y-1">
              {collections.map((collection) => {
                const active = selectedCollection === collection.id;
                const isSmart = collection.isSmart ?? false;

                const filterHint = isSmart && collection.filter
                  ? (() => {
                      try {
                        const parsed = JSON.parse(collection.filter) as Record<string, string>;
                        return Object.entries(parsed).map(([k, v]) => `${k}: "${v}"`).join(", ");
                      } catch {
                        return "";
                      }
                    })()
                  : "";

                const countEl = typeof collection.fileCount === "number" ? (
                  <span className={cn("text-[10px] tabular-nums", active ? "text-primary" : "text-muted-foreground")}>
                    {collection.fileCount}
                  </span>
                ) : null;

                const actionMenu = (onRenameCollection || onConvertToRegularCollection || onDeleteCollection) && (
                  <div className="flex items-center gap-0.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <span
                            className="size-5 flex items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-accent/50"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="size-3" />
                          </span>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-44">
                        {onRenameCollection && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRenameCollection(collection.id, collection.name);
                            }}
                          >
                            <Pencil className="mr-2 size-3.5" />
                            Rename
                          </DropdownMenuItem>
                        )}
                        {isSmart && onConvertToRegularCollection && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleConvertToRegularCollection(collection.id);
                            }}
                          >
                            <Filter className="mr-2 size-3.5" />
                            Convert to Playlist
                          </DropdownMenuItem>
                        )}
                        {onDeleteCollection && (
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCollection(collection.id);
                            }}
                          >
                            <Trash2 className="mr-2 size-3.5" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );

                return (
                  <div key={collection.id} className="group">
                    {isSmart && filterHint ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              className={cn(
                                "h-8 w-full text-sm font-normal",
                                navItemClass,
                                active && activeNavItemClass,
                              )}
                              onClick={() => handleSelectCollection(collection.id)}
                            >
                              <Filter className={cn("size-3.5 shrink-0", active && "text-primary")} />
                              <span className="truncate">{collection.name}</span>
                              <span className="ml-auto flex items-center gap-0.5">
                                {countEl}
                                {actionMenu}
                              </span>
                            </Button>
                          }
                        />
                        <TooltipContent side="right" className="text-xs">
                          {filterHint}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button
                        variant="ghost"
                        className={cn(
                          "h-8 w-full text-sm font-normal",
                          navItemClass,
                          active && activeNavItemClass,
                        )}
                        onClick={() => handleSelectCollection(collection.id)}
                      >
                        {isSmart ? (
                          <Filter className={cn("size-3.5 shrink-0", active && "text-primary")} />
                        ) : (
                          <Folder className={cn("size-3.5 shrink-0", active && "text-primary")} />
                        )}
                        <span className="truncate">{collection.name}</span>
                        <span className="ml-auto flex items-center gap-0.5">
                          {countEl}
                          {actionMenu}
                        </span>
                      </Button>
                    )}
                  </div>
                );
              })}
              {collections.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-1">No playlists yet</p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className={sectionHeaderClass}>
              Tags
            </h3>
            <div className="flex flex-wrap gap-1.5 px-2">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className="cursor-pointer px-2 py-0.5 text-[10px] transition-colors hover:bg-accent/50 hover:text-accent-foreground"
                  style={{
                    borderColor: tag.color + "40",
                    backgroundColor: tag.color + "10",
                    color: tag.color,
                  }}
                >
                  {tag.name}
                </Badge>
              ))}
              {tags.length === 0 && (
                 <p className="text-xs text-muted-foreground">No tags yet</p>
              )}
            </div>
          </section>
        </div>
      </ScrollArea>

      <div className="relative border-t border-border/40 bg-card/60 p-4 backdrop-blur-xl">
        <div className="mb-4 rounded-2xl border border-border/40 bg-card/60 p-3 shadow-sm backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <DotmSquare3
              size={24}
              dotSize={3}
              speed={1.2}
              animated={scanStatus.running}
              muted={!scanStatus.running && !scanComplete}
              pattern="full"
              ariaLabel={scanStatus.running ? "Scan running" : "Scan idle"}
              className={cn(
                "shrink-0",
                scanStatus.running
                  ? "text-primary"
                  : scanComplete
                    ? "text-foreground"
                    : "text-muted-foreground/70",
              )}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                <span>Status</span>
                <span className={scanStatus.running ? "text-primary" : "text-muted-foreground"}>
                  {scanStatus.phase}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {statusDetail}
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 rounded-xl text-xs transition-[background-color,color,box-shadow] duration-200"
          onClick={handleOpenSettings}
        >
          <Settings className="size-3.5" />
          Settings
        </Button>
      </div>
    </aside>
  );
}
