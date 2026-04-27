"use client";

import { Folder, Heart, List, Tag, Settings, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

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
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card/30 flex flex-col overflow-hidden">
      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight px-2">SoundSlop</h2>
          {scanStatus.running && (
             <Activity className="size-4 text-primary animate-pulse" />
          )}
        </div>
        
        <div className="space-y-1">
          <Button
            variant={currentView === "all" || currentView === "directory" ? "secondary" : "ghost"}
            className="w-full justify-start gap-3"
            onClick={onSelectLibrary}
          >
            <List className="size-4" />
            Library
          </Button>
          <Button
            variant={currentView === "favorites" ? "secondary" : "ghost"}
            className="w-full justify-start gap-3"
            onClick={onSelectFavorites}
          >
            <Heart className={`size-4 ${currentView === "favorites" ? "fill-current text-red-500" : ""}`} />
            Favorites
          </Button>
        </div>
      </div>

      <Separator className="mx-4 w-auto" />

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
              Playlists
            </h3>
            <div className="space-y-1">
              {collections.map((collection) => (
                <Button
                  key={collection.id}
                  variant={selectedCollection === collection.id ? "secondary" : "ghost"}
                  className="w-full justify-start gap-3 h-8 text-sm font-normal"
                  onClick={() => onSelectCollection(collection.id)}
                >
                  <Folder className="size-3.5" />
                  <span className="truncate">{collection.name}</span>
                  {typeof collection.fileCount === "number" && (
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {collection.fileCount}
                    </span>
                  )}
                </Button>
              ))}
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

      <div className="p-4 border-t border-border bg-background/50">
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">
            <span>Status</span>
            <span className={scanStatus.running ? "text-primary" : ""}>{scanStatus.phase}</span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
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
          className="w-full gap-2 text-xs" 
          onClick={onOpenSettings}
        >
          <Settings className="size-3.5" />
          Settings
        </Button>
      </div>
    </aside>
  );
}
