"use client";

// app-v3 adapters for the library dialogs: extension details, save search,
// rename collection (src/app/library/dialogs.tsx) and the inline
// similar-sounds dialog from src/app/page.tsx. Same props, callbacks and
// validation guards, I-styled dialog construction.
import { useId } from "react";
import { Save } from "lucide-react";

import {
  Button,
  Dialog,
  DialogFooter,
  DialogTitle,
  Field,
  StatusBadge,
  TagChip,
} from "@/components/variant-i";
import type { ExtensionGridItem } from "@/lib/extensions/types";

export function V3SaveSearchDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
}) {
  const titleId = useId();

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      labelledBy={titleId}
      maxWidth="max-w-sm"
    >
      <DialogTitle id={titleId}>Save Search</DialogTitle>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const name = data.get("name") as string;
          if (name.trim()) onSave(name.trim());
        }}
        className="mt-4 space-y-4"
      >
        <Field
          name="name"
          placeholder="Collection name..."
          autoFocus
          className="rounded-xl"
        />
        <DialogFooter>
          <Button
            tone="secondary"
            size="sm"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button tone="primary" size="sm" type="submit">
            <Save />
            Save
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export function V3RenameCollectionDialog({
  target,
  onOpenChange,
  onRename,
}: {
  target: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onRename: (name: string) => void;
}) {
  const titleId = useId();

  return (
    <Dialog
      open={target !== null}
      onClose={() => onOpenChange(false)}
      labelledBy={titleId}
      maxWidth="max-w-sm"
    >
      <DialogTitle id={titleId}>Rename Collection</DialogTitle>
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
        <Field
          key={target?.id ?? "new"}
          name="name"
          defaultValue={target?.name ?? ""}
          placeholder="Collection name..."
          autoFocus
          className="rounded-xl"
        />
        <DialogFooter>
          <Button
            tone="secondary"
            size="sm"
            type="button"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button tone="primary" size="sm" type="submit">
            Save
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

export function V3ExtensionDetailsDialog({
  extension,
  onOpenChange,
  onRunCommand,
}: {
  extension: ExtensionGridItem | null;
  onOpenChange: (open: boolean) => void;
  onRunCommand: (extensionId: string, commandId: string) => void;
}) {
  const titleId = useId();

  return (
    <Dialog
      open={extension !== null}
      onClose={() => onOpenChange(false)}
      labelledBy={titleId}
      maxWidth="max-w-lg"
    >
      <div className="flex items-center gap-2">
        <DialogTitle id={titleId}>
          {extension?.name ?? "Extension details"}
        </DialogTitle>
        {extension ? (
          <StatusBadge
            status={extension.enabled ? "Enabled" : "Disabled"}
            tone={extension.enabled ? "ready" : "unavailable"}
          />
        ) : null}
      </div>
      {extension ? (
        <div className="mt-4 space-y-5 text-sm">
          <div className="space-y-1">
            <p className="text-zinc-400">{extension.description}</p>
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
                      onRunCommand(extension.id, command.id);
                    }}
                    className="rounded-full border border-[var(--vi-edge)] bg-white/[0.03] px-2.5 py-1 font-mono text-xs text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-colors hover:border-[color-mix(in_oklab,var(--accent-fill)_50%,transparent)] hover:bg-[color-mix(in_oklab,var(--accent-fill)_10%,transparent)] hover:text-accent-text focus-visible:ring-2 focus-visible:ring-[var(--vi-focus)]"
                    title={`Run: ${command.title}`}
                  >
                    {command.title}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">No commands exposed.</p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-200">Permissions</h3>
            {extension.permissions?.length ? (
              <div className="flex flex-wrap gap-2">
                {extension.permissions.map((permission) => (
                  <TagChip key={permission}>{permission}</TagChip>
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
                  <TagChip key={surface}>{surface}</TagChip>
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
    </Dialog>
  );
}

export type V3SimilarSoundsState = {
  source: string;
  state: "unavailable" | "empty" | "ready";
  matches: Array<{ fileId: string; filename: string; score: number }>;
};

export function V3SimilarSoundsDialog({
  open,
  onOpenChange,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: V3SimilarSoundsState | null;
}) {
  const titleId = useId();

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      labelledBy={titleId}
      maxWidth="max-w-sm"
    >
      <DialogTitle id={titleId}>Similar sounds</DialogTitle>
      {state ? (
        <>
          <p className="mt-1.5 truncate font-mono text-[11px] text-zinc-500">
            Compared with {state.source}
          </p>
          {state.state === "unavailable" ? (
            <p className="mt-3 text-[13px] text-zinc-400">
              Similarity unavailable until audio analysis completes.
            </p>
          ) : null}
          {state.state === "empty" ? (
            <p className="mt-3 text-[13px] text-zinc-400">
              Analysis is available, but no similar files met the threshold.
            </p>
          ) : null}
          {state.state === "ready" ? (
            <ul className="mt-3 divide-y divide-[var(--vi-edge)]">
              {state.matches.map((match) => (
                <li key={match.fileId} className="flex gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">
                    {match.filename}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-zinc-500">
                    {Math.round(match.score * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </Dialog>
  );
}