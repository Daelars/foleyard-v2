"use client";

import type { ReactNode } from "react";
import { FolderOpen } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Shared bordered card section with an icon heading and optional count badge. */
export function ExtensionSection({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode;
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{title}</span>
        {typeof count === "number" && count > 0 ? (
          <Badge variant="secondary">{count}</Badge>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Shared path row: a text input plus the desktop folder picker when available. */
export function ExtensionPathField({
  value,
  onChange,
  placeholder,
  showPick,
  pickLabel,
  onPick,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  showPick: boolean;
  pickLabel: string;
  onPick: () => void;
}) {
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="flex-1"
      />
      {showPick ? (
        <Button variant="outline" size="sm" onClick={onPick}>
          <FolderOpen className="mr-1 size-3" />
          {pickLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** Shared read-only status banner for previews, results, and empty states. */
export function ExtensionStatusBanner({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <Alert>
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

/** Shared action row for dialog footers. */
export function ExtensionFooterRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2">{children}</div>;
}

/** Shared dashed hint row for idle dialog states. */
export function ExtensionHintRow({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3">
      {icon}
      <p className="text-xs text-zinc-400">{children}</p>
    </div>
  );
}
