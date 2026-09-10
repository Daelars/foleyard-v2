"use client";

// app-v3 adapters for the library dialogs: save search, rename collection
// (src/app/library/dialogs.tsx) and the inline similar-sounds dialog from
// the previous root page. Same props, callbacks and validation guards,
// I-styled dialog construction.
import { useId } from "react";
import { Save } from "lucide-react";

import {
  Button,
  Dialog,
  DialogFooter,
  DialogTitle,
  Field,
} from "@/components/variant-i";

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