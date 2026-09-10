"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileCode2, FileText, ImageIcon, Search } from "lucide-react";

import type { ArchiveEntry } from "@/lib/archive";
import { Markdown } from "@/components/markdown";

function archiveUrl(artifactPath: string): string {
  return (
    "/prototype/archive/" + artifactPath.split("/").map(encodeURIComponent).join("/")
  );
}

function KindIcon({ kind }: { kind: ArchiveEntry["kind"] }) {
  if (kind === "html") return <FileCode2 className="size-4 shrink-0 text-zinc-600" />;
  if (kind === "markdown") return <FileText className="size-4 shrink-0 text-zinc-600" />;
  return <ImageIcon className="size-4 shrink-0 text-zinc-600" />;
}

export function ArchiveBrowser({
  entries,
  rootPath,
  source,
}: {
  entries: ArchiveEntry[];
  rootPath: string;
  source: "env" | "sibling";
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ArchiveEntry | null>(null);
  const [markdown, setMarkdown] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected || selected.kind !== "markdown" || markdown[selected.path]) return;
    let cancelled = false;
    fetch(archiveUrl(selected.path))
      .then(async (response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status}).`);
        return response.text();
      })
      .then((text) => {
        if (!cancelled) setMarkdown((prev) => ({ ...prev, [selected.path]: text }));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load artifact.");
      });
    return () => {
      cancelled = true;
    };
  }, [selected, markdown]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? entries.filter(
          (entry) =>
            entry.title.toLowerCase().includes(q) || entry.path.toLowerCase().includes(q),
        )
      : entries;
    const map = new Map<string, ArchiveEntry[]>();
    for (const entry of filtered) {
      const list = map.get(entry.group) ?? [];
      list.push(entry);
      map.set(entry.group, list);
    }
    return [...map.entries()];
  }, [entries, query]);

  const searchBox = (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 transition-all focus-within:border-accent-fill/60">
      <Search className="size-4 shrink-0 text-zinc-500" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Search ${entries.length} artifacts...`}
        aria-label="Search archive artifacts"
        className="w-full bg-transparent py-2.5 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none"
      />
    </div>
  );

  if (!selected) {
    return (
      <div className="flex flex-col gap-4">
        <div className="w-full md:max-w-sm">{searchBox}</div>
        {grouped.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-zinc-500">
            No artifacts match.
          </p>
        ) : null}
        {grouped.map(([group, docs]) => (
          <section key={group}>
            <h2 className="px-1 font-mono text-[11px] font-bold uppercase tracking-widest text-zinc-500">
              {group} · {docs.length}
            </h2>
            <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {docs.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSelected(entry);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left hover:border-edge hover:bg-white/[0.05]"
                  >
                    <KindIcon kind={entry.kind} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">
                      {entry.title}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-zinc-600">
                      {entry.path}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="font-mono text-[11px] text-zinc-600">
          archive root: {rootPath} ({source})
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:border-accent-fill/50 hover:text-zinc-100"
        >
          <ArrowLeft className="size-3.5" />
          All artifacts
        </button>
        <span className="font-mono text-[11px] text-zinc-500">{selected.path}</span>
        {selected.kind === "html" ? (
          <a
            href={archiveUrl(selected.path)}
            target="_blank"
            rel="noreferrer"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:border-accent-fill/50 hover:text-zinc-100"
          >
            Open full page
          </a>
        ) : null}
      </div>
      {selected.kind === "html" ? (
        <iframe
          src={archiveUrl(selected.path)}
          title={selected.title}
          className="h-[75vh] w-full rounded-xl border border-white/10 bg-black/20"
        />
      ) : selected.kind === "image" ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={archiveUrl(selected.path)}
          alt={selected.title}
          className="max-h-[75vh] w-auto rounded-xl border border-white/10"
        />
      ) : error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : markdown[selected.path] ? (
        <article className="rounded-xl border border-white/10 bg-white/[0.02] p-5 md:p-8">
          <Markdown text={markdown[selected.path]} />
        </article>
      ) : (
        <p className="animate-pulse text-sm text-zinc-500">Loading {selected.title}…</p>
      )}
    </div>
  );
}
