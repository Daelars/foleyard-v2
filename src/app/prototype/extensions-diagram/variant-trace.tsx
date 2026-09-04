"use client";

// VARIANT C — "Inspector". No boxes and arrows. Pick a real command and read the
// concrete trace the host would run for it, plus the permission matrix underneath.
// Answers the same question by instance rather than by abstraction.

import { useMemo, useState } from "react";

import {
  ALL_PERMISSIONS,
  EXTENSIONS,
  FAILURE_REASONS,
  PERMISSION_TO_SERVICE,
  type Command,
  type Extension,
} from "./diagram-data";

type TraceLine = {
  actor: string;
  text: string;
  tone: "neutral" | "gate" | "ok" | "warn";
};

function buildTrace(extension: Extension, command: Command): TraceLine[] {
  const selection =
    command.scope === "folder"
      ? '{ folderPath: "D:/Sfx/Foley" }'
      : command.requiresSelection
        ? '{ fileIds: ["f_812", "f_913"] }'
        : "{}";

  const lines: TraceLine[] = [
    {
      actor: "surface",
      text: `executeHostedCommand("${extension.id}", "${command.id}", ${selection})`,
      tone: "neutral",
    },
    {
      actor: "POST",
      text: "/api/extensions/execute — no `input` field, so the generic route accepts it",
      tone: "neutral",
    },
    {
      actor: "host",
      text: "registerAllExtensions() — 6 manifests in the registry",
      tone: "neutral",
    },
    {
      actor: "gate",
      text: `registry.get("${extension.id}") → found  ·  else extension-not-found`,
      tone: "gate",
    },
    {
      actor: "gate",
      text: `isEnabled("${extension.id}") → reads the DB toggle  ·  else extension-disabled`,
      tone: "gate",
    },
    {
      actor: "core",
      text: `createYardExtensionContext({ permissions: [${extension.permissions
        .map((permission) => `"${permission}"`)
        .join(", ")}] })`,
      tone: "neutral",
    },
    {
      actor: extension.id,
      text: `registerCommands(context) — registers ${extension.commands.length} handler${
        extension.commands.length === 1 ? "" : "s"
      } into the scoped registry`,
      tone: "neutral",
    },
    {
      actor: "gate",
      text: `commands.get("${command.id}") → found  ·  else command-not-found`,
      tone: "gate",
    },
  ];

  if (command.requiresSelection) {
    lines.push({
      actor: "gate",
      text: "selection.fileIds.length > 0  ·  else validation-failed",
      tone: "gate",
    });
  }

  if (command.scope === "folder") {
    lines.push({
      actor: "gate",
      text: "selection.folderPath is set  ·  else validation-failed",
      tone: "gate",
    });
  }

  lines.push({
    actor: "handler",
    text: `permissions.require(...) per protected step  ·  throws YardPermissionError → permission-denied`,
    tone: "gate",
  });

  if (command.destructive) {
    lines.push({
      actor: "handler",
      text: "destructive: true — the manifest flags this so surfaces can confirm first",
      tone: "warn",
    });
  }

  if (command.intent) {
    lines.push({
      actor: "handler",
      text: `returns createYardUiIntent("${command.intent}", payload)`,
      tone: "neutral",
    });
    lines.push({
      actor: "host",
      text: `isYardUiIntent(value) → true  ·  { ok: true, type: "ui-intent" }`,
      tone: "ok",
    });
    lines.push({
      actor: "client",
      text: `interpretExtensionUiIntent() matches "${command.intent}" and opens the real UI`,
      tone: "ok",
    });
  } else {
    lines.push({
      actor: "handler",
      text: "returns a plain value — the work finished server-side",
      tone: "neutral",
    });
    lines.push({
      actor: "host",
      text: `isYardUiIntent(value) → false  ·  { ok: true, type: "value", value }`,
      tone: "ok",
    });
  }

  return lines;
}

const TONE: Record<TraceLine["tone"], string> = {
  neutral: "text-zinc-400",
  gate: "text-amber-300/90",
  ok: "text-emerald-300/90",
  warn: "text-destructive",
};

export function VariantTrace() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(EXTENSIONS[3].commands[0].id);

  const rows = useMemo(
    () =>
      EXTENSIONS.flatMap((extension) =>
        extension.commands.map((command) => ({ extension, command })),
      ).filter(({ extension, command }) => {
        const needle = query.toLowerCase();
        return (
          !needle ||
          command.id.toLowerCase().includes(needle) ||
          command.title.toLowerCase().includes(needle) ||
          extension.name.toLowerCase().includes(needle)
        );
      }),
    [query],
  );

  const active =
    rows.find(({ command }) => command.id === selected) ??
    EXTENSIONS.flatMap((extension) =>
      extension.commands.map((command) => ({ extension, command })),
    ).find(({ command }) => command.id === selected)!;

  const trace = buildTrace(active.extension, active.command);
  const usedPermissions = new Set(
    EXTENSIONS.flatMap((extension) => extension.permissions),
  );

  return (
    <div className="min-h-screen bg-[#0b0b10] text-zinc-200">
      <div className="border-b border-white/10 px-6 py-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent-text">
          Foleyard extensions
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
          Command inspector
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          18 commands across 6 extensions. Pick one to read the trace the host
          would actually run.
        </p>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr]">
        <div className="border-white/10 lg:border-r">
          <div className="border-b border-white/10 p-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter commands…"
              className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-accent-fill/50"
            />
          </div>

          <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
            {EXTENSIONS.map((extension) => {
              const visible = rows.filter(
                (row) => row.extension.id === extension.id,
              );
              if (visible.length === 0) return null;

              return (
                <div key={extension.id}>
                  <div className="sticky top-0 flex items-center justify-between bg-[#0b0b10] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    <span>{extension.name}</span>
                    <span className="font-mono normal-case tracking-normal text-zinc-700">
                      {extension.permissions.length}p / {extension.surfaces.length}s
                    </span>
                  </div>
                  {visible.map(({ command }) => (
                    <button
                      key={command.id}
                      type="button"
                      onClick={() => setSelected(command.id)}
                      className={`block w-full border-l-2 px-3 py-1.5 text-left transition-colors ${
                        selected === command.id
                          ? "border-accent-fill bg-accent-fill/10"
                          : "border-transparent hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`truncate text-xs ${
                            selected === command.id
                              ? "font-semibold text-white"
                              : "text-zinc-300"
                          }`}
                        >
                          {command.title}
                        </span>
                        {command.destructive && (
                          <span className="shrink-0 rounded bg-destructive/20 px-1 text-[8px] font-bold uppercase text-destructive">
                            destr
                          </span>
                        )}
                      </div>
                      <div className="truncate font-mono text-[9px] text-zinc-600">
                        {command.scope}
                        {command.requiresSelection ? " · needs selection" : ""}
                        {command.intent ? " · ui-intent" : ""}
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 pb-28">
          <div className="mb-1 font-mono text-xs text-accent-text">
            {active.command.id}
          </div>
          <div className="text-lg font-semibold text-white">
            {active.command.title}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            {active.extension.blurb}
          </p>

          <div className="mt-5 rounded-lg border border-white/10 bg-black/40 p-4">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              trace
            </div>
            <ol className="space-y-1.5 font-mono text-[11px] leading-relaxed">
              {trace.map((line, lineIndex) => (
                <li key={lineIndex} className="flex gap-3">
                  <span className="w-5 shrink-0 text-right text-zinc-700">
                    {lineIndex + 1}
                  </span>
                  <span className="w-20 shrink-0 truncate text-zinc-600">
                    {line.actor}
                  </span>
                  <span className={TONE[line.tone]}>{line.text}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Failure reasons the host can return
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {FAILURE_REASONS.map((reason) => (
                  <code
                    key={reason}
                    className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
                  >
                    {reason}
                  </code>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                Every one is a tagged value, not a thrown error — the route maps
                the tag onto an HTTP status.
              </p>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Dedicated routes
              </div>
              <div className="mt-2 space-y-0.5">
                {active.extension.dedicatedRoutes.map((route) => (
                  <div key={route} className="font-mono text-[10px] text-zinc-400">
                    {route}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                These exist because{" "}
                <code className="font-mono text-[10px]">/execute</code> refuses any
                request carrying input.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Permission matrix
            </div>
            <div className="overflow-x-auto rounded-lg border border-white/10">
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-[#0b0b10] p-2 text-left font-semibold text-zinc-500">
                      permission
                    </th>
                    {EXTENSIONS.map((extension) => (
                      <th
                        key={extension.id}
                        className="p-2 text-center font-mono font-normal text-zinc-500"
                      >
                        <span className="block max-w-[70px] truncate">
                          {extension.name}
                        </span>
                      </th>
                    ))}
                    <th className="p-2 text-left font-semibold text-zinc-500">
                      unlocks
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ALL_PERMISSIONS.map((permission) => {
                    const unused = !usedPermissions.has(permission);

                    return (
                      <tr
                        key={permission}
                        className={`border-t border-white/5 ${
                          unused ? "opacity-35" : ""
                        }`}
                      >
                        <td className="sticky left-0 bg-[#0b0b10] p-1.5 font-mono text-zinc-400">
                          {permission}
                        </td>
                        {EXTENSIONS.map((extension) => {
                          const held = extension.permissions.includes(permission);
                          const isActive = extension.id === active.extension.id;

                          return (
                            <td
                              key={extension.id}
                              className={`p-1.5 text-center ${
                                isActive ? "bg-accent-fill/[0.07]" : ""
                              }`}
                            >
                              {held ? (
                                <span
                                  className={`inline-block size-2 rounded-full ${
                                    isActive ? "bg-accent-fill" : "bg-zinc-500"
                                  }`}
                                />
                              ) : (
                                <span className="text-zinc-800">·</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-1.5 font-mono text-zinc-600">
                          {PERMISSION_TO_SERVICE[permission]}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-zinc-600">
              Faded rows are permissions the type defines but no shipped extension
              asks for.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
