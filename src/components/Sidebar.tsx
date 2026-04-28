"use client";

import { Folder, Heart, List, Settings, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface SidebarProps {
  currentView: "all" | "favorites" | "collection" | "directory";
  collections: { id: string; name: string; fileCount?: number }[];
  selectedCollection: string | null;
  tags: { id: string; name: string; color: string }[];
  scanStatus: {
    phase: string;
    discovered: number;
    running: boolean;
  };
  onOpenSettings: () => void;
  onSelectLibrary: () => void;
  onSelectFavorites: () => void;
  onSelectCollection: (id: string) => void;
}

export function Sidebar({
  currentView,
  collections,
  selectedCollection,
  tags,
  scanStatus,
  onOpenSettings,
  onSelectLibrary,
  onSelectFavorites,
  onSelectCollection,
}: SidebarProps) {
  const libraryActive = currentView === "all" || currentView === "directory";
  const favoritesActive = currentView === "favorites";

  return (
    <aside className="relative flex w-64 shrink-0 flex-col overflow-hidden border-r border-border/70 bg-card/55 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_36%)]" />
      <div className="relative flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight px-2">SoundSlop</h2>
          {scanStatus.running && (
             <Activity className="size-4 text-primary animate-pulse" />
          )}
        </div>
        
        <div className="space-y-1">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3 rounded-xl text-muted-foreground hover:bg-primary/8 hover:text-foreground",
              libraryActive &&
                "bg-primary/12 text-foreground ring-1 ring-primary/20 shadow-[inset_3px_0_0_var(--primary)] hover:bg-primary/14",
            )}
            onClick={onSelectLibrary}
          >
            <List className={cn("size-4", libraryActive && "text-primary")} />
            Library
          </Button>
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start gap-3 rounded-xl text-muted-foreground hover:bg-primary/8 hover:text-foreground",
              favoritesActive &&
                "bg-primary/12 text-foreground ring-1 ring-primary/20 shadow-[inset_3px_0_0_var(--primary)] hover:bg-primary/14",
            )}
            onClick={onSelectFavorites}
          >
            <Heart className={cn("size-4", favoritesActive && "fill-current text-primary")} />
            Favorites
          </Button>
        </div>
      </div>

      <Separator className="relative mx-4 w-auto" />

      <ScrollArea className="relative flex-1">
        <div className="p-4 space-y-6">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
              Playlists
            </h3>
            <div className="space-y-1">
              {collections.map((collection) => {
                const active = selectedCollection === collection.id;

                return (
                  <Button
                    key={collection.id}
                    variant="ghost"
                    className={cn(
                      "h-8 w-full justify-start gap-3 rounded-lg text-sm font-normal text-muted-foreground hover:bg-primary/8 hover:text-foreground",
                      active &&
                        "bg-primary/12 text-foreground ring-1 ring-primary/20 shadow-[inset_3px_0_0_var(--primary)] hover:bg-primary/14",
                    )}
                    onClick={() => onSelectCollection(collection.id)}
                  >
                    <Folder className={cn("size-3.5", active && "text-primary")} />
                    <span className="truncate">{collection.name}</span>
                    {typeof collection.fileCount === "number" && (
                      <span className={cn("ml-auto text-[10px]", active ? "text-primary" : "text-muted-foreground")}>
                        {collection.fileCount}
                      </span>
                    )}
                  </Button>
                );
              })}
              {collections.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-1">No playlists yet</p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
              Tags
            </h3>
            <div className="flex flex-wrap gap-1.5 px-2">
              {tags.map((tag) => (
                <Badge
                  key={tag.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-accent transition-colors py-0.5 px-2 text-[10px]"
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

      <div className="relative border-t border-border/70 bg-background/45 p-4 backdrop-blur-xl">
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
            <span>Status</span>
            <span className={scanStatus.running ? "text-primary" : ""}>{scanStatus.phase}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted shadow-inner">
             <div 
               className={`h-full bg-primary transition-all duration-500 ${scanStatus.running ? "w-1/2 animate-pulse" : "w-full"}`} 
             />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {scanStatus.discovered} files discovered
          </p>
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full gap-2 rounded-xl text-xs" 
          onClick={onOpenSettings}
        >
          <Settings className="size-3.5" />
          Settings
        </Button>
      </div>
    </aside>
  );
}
