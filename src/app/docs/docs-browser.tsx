"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Search } from "lucide-react";

import type { DocumentEntry } from "@/lib/documentation";
import { Markdown } from "@/components/markdown";

import { resolveDocHref } from "./resolve-doc-link";

type DocsLocation = {
  manifestId: string;
  productVersion: string;
  matched: boolean;
  matchState: "matched" | "mismatched" | "unversioned" | "missing-manifest";
  mismatches: Array<{ field: string; expected: string; actual: string }>;
  manifest: {
    productVersion: string | null;
    buildId: string | null;
    sourceRevision: string | null;
    sourceDirty: boolean | null;
    documentCount: number;
  } | null;
};

type DocsExample = { id: string };

function docHref(id: string | null): string {
  return id === null ? "/docs" : `/docs/${id}`;
}

function groupFor(id: string): string {
  if (id.startsWith("architecture/")) return "Architecture";
  if (id.startsWith("adr/")) return "Decisions";
  if (id === "index" || id === "readme" || id === "quickstart" || id === "development") {
    return "Start here";
  }
  if (id.startsWith("extensions")) return "Extensions";
  return "Guides";
}

const GROUP_ORDER = ["Start here", "Guides", "Extensions", "Architecture", "Decisions"];


export function DocsBrowser({
  documents,
  location,
  examples,
  initialId,
}: {
  documents: DocumentEntry[];
  location: DocsLocation;
  examples: DocsExample[];
  initialId: string | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Deep-link sync: the [...id] route remounts per document through the key
  // below, but back/forward navigation reuses this instance with a new prop.
  useEffect(() => {
    if (initialId !== selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(initialId);
    }
    // selectedId intentionally omitted: this mirrors the prop, it never drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  const loadDoc = useCallback(async (id: string) => {
    setPendingId(id);
    setError(null);
    try {
      const path = id.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`/api/docs/${path}`);
      const body = (await res.json()) as { content?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
      setContents((prev) => ({ ...prev, [id]: body.content ?? "" }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load document.");
    } finally {
      setPendingId((current) => (current === id ? null : current));
    }
  }, []);

  // Mount/selection fetch, deferred out of the effect body so the effect only
  // schedules work (same setTimeout(0) shape as the workspace initial load).
  useEffect(() => {
    if (!selectedId || contents[selectedId] || pendingId === selectedId) return;
    const timer = window.setTimeout(() => {
      void loadDoc(selectedId);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedId, contents, pendingId, loadDoc]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(
      (d) => d.title.toLowerCase().includes(q) || d.id.toLowerCase().includes(q),
    );
  }, [documents, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, DocumentEntry[]>();
    for (const doc of filtered) {
      const g = groupFor(doc.id);
      const list = map.get(g) ?? [];
      list.push(doc);
      map.set(g, list);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, docs: map.get(g)! }));
  }, [filtered]);

  const selected = selectedId ? documents.find((d) => d.id === selectedId) : undefined;
  const content = selected ? contents[selected.id] : undefined;

  const docIdByPath = useMemo(
    () => new Map(documents.map((doc) => [doc.relativePath, doc.id])),
    [documents],
  );
  const linkFor = useCallback(
    (href: string) =>
      selected ? resolveDocHref(selected.relativePath, href, docIdByPath) : null,
    [selected, docIdByPath],
  );

  const select = (id: string | null) => {
    setSelectedId(id);
    router.replace(docHref(id), { scroll: false });
  };

  const searchBox = (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 transition-all focus-within:border-accent-fill/60">
      <Search className="size-4 shrink-0 text-zinc-500" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Search ${documents.length} guides...`}
        aria-label="Search documentation"
        className="w-full bg-transparent py-2.5 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none"
      />
      {query ? (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] text-zinc-500 hover:text-zinc-100"
        >
          Clear
        </button>
      ) : null}
    </div>
  );

  if (!selected) {
    return (
      <div className="flex flex-col gap-4">
        <div className="w-full md:max-w-sm">{searchBox}</div>
        {grouped.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-zinc-500">
            No guides match &ldquo;{query}&rdquo;.
          </p>
        ) : null}
        {grouped.map(({ group, docs }) => (
          <section key={group}>
            <h2 className="px-1 font-mono text-[11px] font-bold uppercase tracking-widest text-zinc-500">
              {group} · {docs.length}
            </h2>
            <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {docs.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => select(doc.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left hover:border-edge hover:bg-white/[0.05]"
                  >
                    <BookOpen className="size-4 shrink-0 text-zinc-600" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">
                      {doc.title}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-zinc-600">/docs/{doc.id}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <aside className="w-full shrink-0 md:w-80">
        <div className="w-full">{searchBox}</div>
        <nav aria-label="Documentation" className="mt-3 space-y-4">
          {grouped.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-zinc-500">
              No guides match &ldquo;{query}&rdquo;.
            </p>
          ) : null}
          {grouped.map(({ group, docs }) => (
            <section key={group}>
              <h2 className="px-1 font-mono text-[11px] font-bold uppercase tracking-widest text-zinc-500">
                {group} · {docs.length}
              </h2>
              <ul className="mt-1.5 space-y-1">
                {docs.map((doc) => {
                  const active = doc.id === selected?.id;
                  return (
                    <li key={doc.id}>
                      <button
                        type="button"
                        onClick={() => select(doc.id)}
                        aria-current={active ? "page" : undefined}
                        className={
                          active
                            ? "flex w-full items-start gap-2 rounded-lg border border-edge-accent-soft bg-[color-mix(in_oklab,var(--accent-fill)_12%,transparent)] px-3 py-2 text-left"
                            : "flex w-full items-start gap-2 rounded-lg border border-transparent px-3 py-2 text-left hover:border-edge hover:bg-white/[0.04]"
                        }
                      >
                        <BookOpen className={active ? "mt-0.5 size-4 shrink-0 text-accent-text" : "mt-0.5 size-4 shrink-0 text-zinc-600"} />
                        <span className="min-w-0">
                          <span className={active ? "block truncate text-sm font-semibold text-zinc-50" : "block truncate text-sm font-medium text-zinc-200"}>
                            {doc.title}
                          </span>
                          <span className="block truncate font-mono text-[11px] text-zinc-500">/docs/{doc.id}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
      </aside>

      <article className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.02] p-5 md:p-8">
        <button
          type="button"
          onClick={() => select(null)}
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-zinc-400 hover:border-accent-fill/50 hover:text-zinc-100"
        >
          <ArrowLeft className="size-3.5" />
          All guides
        </button>
        <p className="font-mono text-[11px] text-zinc-500">
          {location.manifestId} · v{location.productVersion} · {selected.relativePath}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-zinc-50">{selected.title}</h1>
        <p className="mt-2">
          <Link href={docHref(selected.id)} className="font-mono text-[11px] text-zinc-500 hover:text-zinc-200">
            Shareable link: /docs/{selected.id}
          </Link>
        </p>
        <div className="mt-6">
          {pendingId === selected.id && !content ? (
            <p className="animate-pulse text-sm text-zinc-500">Loading {selected.title}…</p>
          ) : error && !content ? (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : content ? (
            <Markdown text={content} linkFor={linkFor} />
          ) : null}
        </div>
      </article>
    </div>
  );
}

/** Match verdict, mismatches and the derived example list (#240/#249/#250). */
export function DocsStatus({
  location,
  examples,
}: {
  location: DocsLocation;
  examples: DocsExample[];
}) {
  return (
    <div className="mt-3 grid gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-zinc-400">
      <p>
        <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
          Docs match
        </span>{" "}
        {location.matched ? (
          <span className="text-emerald-400">
            matched · {location.manifestId} v{location.productVersion}
          </span>
        ) : (
          <span className="text-amber-400">{location.matchState}</span>
        )}
      </p>
      {location.mismatches.map((mismatch) => (
        <p
          key={`${mismatch.field}:${mismatch.expected}`}
          className="font-mono text-[11px] text-amber-300/90"
        >
          {mismatch.field}: expected {mismatch.expected}, actual {mismatch.actual}
        </p>
      ))}
      <p>
        <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-500">
          Examples
        </span>{" "}
        {examples.length > 0 ? examples.map((example) => example.id).join(", ") : "none"}
      </p>
    </div>
  );
}

export function DocsHeader({ count }: { count: number }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">Documentation</h1>
      <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-zinc-400">
        {count} guides
      </span>
      <span className="flex-1" />
      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-accent-fill/50 hover:text-zinc-50"
      >
        <ArrowLeft className="size-4" />
        Back to library
      </Link>
    </div>
  );
}
