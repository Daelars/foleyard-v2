"use client";

import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ExtensionGridItem } from "@/lib/extensions/types";

export function SaveSearchDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border border-white/10 bg-shell/95 p-6 backdrop-blur-2xl">
        <DialogTitle className="text-lg font-extrabold tracking-tight text-zinc-50">Save Search</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const name = data.get("name") as string;
            if (name.trim()) onSave(name.trim());
          }}
          className="mt-4 space-y-4"
        >
          <Input
            name="name"
            placeholder="Collection name..."
            autoFocus
            className="rounded-xl border-white/10 bg-black/30"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              <Save className="size-4" />
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenameCollectionDialog({
  target,
  onOpenChange,
  onRename,
}: {
  target: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onRename: (name: string) => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border border-white/10 bg-shell/95 p-6 backdrop-blur-2xl">
        <DialogTitle className="text-lg font-extrabold tracking-tight text-zinc-50">Rename Collection</DialogTitle>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const name = data.get("name") as string;
            if (name.trim() && target) {
              onRename(name.trim());
            }
          }}
          className="mt-4 space-y-4"
        >
          <Input
            key={target?.id ?? "new"}
            name="name"
            defaultValue={target?.name ?? ""}
            placeholder="Collection name..."
            autoFocus
            className="rounded-xl border-white/10 bg-black/30"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExtensionDetailsDialog({
  extension,
  onOpenChange,
  onRunCommand,
}: {
  extension: ExtensionGridItem | null;
  onOpenChange: (open: boolean) => void;
  onRunCommand: (extensionId: string, commandId: string) => void;
}) {
  return (
    <Dialog
      open={extension !== null}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-lg rounded-2xl border border-white/10 bg-shell/95 p-6 backdrop-blur-2xl">
        <DialogTitle className="text-lg font-extrabold tracking-tight text-zinc-50">
          {extension?.name ?? "Extension details"}
        </DialogTitle>
        {extension ? (
          <div className="space-y-5 text-sm">
            <div className="space-y-1">
              <p className="text-zinc-400">
                {extension.description}
              </p>
              <p className="font-mono text-xs text-zinc-500">
                {extension.provider} · v{extension.version}
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-200">Commands</h3>
              {extension.commands?.length ? (
                <div className="flex flex-wrap gap-2">
                  {extension.commands.map((command) => (
                    <button
                      key={command.id}
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onRunCommand(
                          extension.id,
                          command.id,
                        );
                      }}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-zinc-300 ring-1 ring-white/10 transition-colors hover:border-accent-fill/50 hover:bg-accent-fill/10 hover:text-accent-text hover:ring-accent-fill/30"
                      title={`Run: ${command.title}`}
                    >
                      {command.title}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  No commands exposed.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-200">Permissions</h3>
              {extension.permissions?.length ? (
                <div className="flex flex-wrap gap-2">
                  {extension.permissions.map((permission) => (
                    <span
                      key={permission}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-zinc-400 ring-1 ring-white/10"
                    >
                      {permission}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  No permissions declared.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-200">Surfaces</h3>
              {extension.surfaces?.length ? (
                <div className="flex flex-wrap gap-2">
                  {extension.surfaces.map((surface) => (
                    <span
                      key={surface}
                      className="rounded-full border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-zinc-400 ring-1 ring-white/10"
                    >
                      {surface}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  No UI surfaces declared.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-zinc-200">Settings</h3>
              {extension.settingsCount ? (
                <p className="text-xs text-zinc-500">
                  This extension exposes {extension.settingsCount} configurable settings.
                </p>
              ) : (
                <p className="text-xs text-zinc-500">
                  This extension has no configurable settings yet.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
