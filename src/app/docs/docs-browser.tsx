"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Search } from "lucide-react";

import type { DocumentEntry } from "@/lib/documentation";

type DocsLocation = {
  manifestId: string;
  productVersion: string;
  matched: boolean;
};

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

// Minimal markdown renderer: headings, tables, lists, code fences,
// blockquotes, bold, inline code, links. No dependencies.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let n = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${n++}`;
    if (token.startsWith("`")) {
      parts.push(
        <code key={key} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-zinc-100">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      parts.push(<strong key={key} className="font-semibold text-zinc-50">{token.slice(2, -2)}</strong>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        const [, label, href] = link;
        const external = /^https?:\/\//.test(href);
        parts.push(
          <a
            key={key}
            href={href}
            {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
            className="text-accent-text underline decoration-accent-fill/50 underline-offset-2 hover:decoration-accent-fill"
          >
            {label}
          </a>,
        );
      } else {
        parts.push(token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const lines = text.split("\n");
    const out: React.ReactNode[] = [];
    let i = 0;
    let key = 0;
    const pushKey = () => `md-${key++}`;

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code block
      if (line.trimStart().startsWith("```")) {
        const fence = pushKey();
        const lang = line.trim().slice(3).trim();
        const body: string[] = [];
        i++;
        while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
          body.push(lines[i]);
          i++;
        }
        i++; // closing fence
        out.push(
          <pre key={fence} className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 font-mono text-[12px] leading-relaxed text-zinc-200">
            {lang ? <div className="mb-2 font-mono text-[11px] text-zinc-500">{lang}</div> : null}
            <code>{body.join("\n")}</code>
          </pre>,
        );
        continue;
      }

      // Table
      if (line.trimStart().startsWith("|") && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        const fence = pushKey();
        const header = line.split("|").map((c) => c.trim()).filter(Boolean);
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && lines[i].trimStart().startsWith("|")) {
          rows.push(lines[i].split("|").map((c) => c.trim()).filter(Boolean));
          i++;
        }
        out.push(
          <div key={fence} className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="bg-white/[0.05]">
                  {header.map((cell, ci) => (
                    <th key={ci} className="border-b border-white/10 px-3 py-2 font-semibold text-zinc-100">
                      {renderInline(cell, `${fence}-h${ci}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="odd:bg-transparent even:bg-white/[0.02]">
                    {row.map((cell, ci) => (
                      <td key={ci} className="border-b border-white/5 px-3 py-2 text-zinc-300">
                        {renderInline(cell, `${fence}-r${ri}c${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }

      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading) {
        const level = heading[1].length;
        const body = heading[2];
        const k = pushKey();
        const cls =
          level === 1
            ? "text-3xl font-extrabold tracking-tight text-zinc-50"
            : level === 2
              ? "mt-2 border-b border-white/10 pb-2 text-xl font-bold tracking-tight text-zinc-50"
              : "text-base font-bold text-zinc-100";
        const Tag = level === 1 ? "h1" : level === 2 ? "h2" : level === 3 ? "h3" : "h4";
        out.push(<Tag key={k} className={cls}>{renderInline(body, k)}</Tag>);
        i++;
        continue;
      }

      if (/^---+\s*$/.test(line.trim())) {
        out.push(<hr key={pushKey()} className="border-white/10" />);
        i++;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const k = pushKey();
        const quote: string[] = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^>\s?/, ""));
          i++;
        }
        out.push(
          <blockquote key={k} className="space-y-1 rounded-r-xl border-l-2 border-accent-fill/60 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
            {quote.map((q, qi) => (
              <p key={qi}>{renderInline(q, `${k}-q${qi}`)}</p>
            ))}
          </blockquote>,
        );
        continue;
      }

      if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        const k = pushKey();
        const ordered = /^\s*\d+\.\s+/.test(line);
        const items: string[] = [];
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
          i++;
        }
        const ListTag = ordered ? "ol" : "ul";
        out.push(
          <ListTag key={k} className={ordered ? "list-decimal space-y-1 pl-6 text-sm leading-relaxed text-zinc-300" : "list-disc space-y-1 pl-6 text-sm leading-relaxed text-zinc-300"}>
            {items.map((item, ii) => (
              <li key={ii}>{renderInline(item, `${k}-li${ii}`)}</li>
            ))}
          </ListTag>,
        );
        continue;
      }

      if (/^\s*$/.test(line)) {
        i++;
        continue;
      }

      // Paragraph: gather until blank or block start
      const k = pushKey();
      const para: string[] = [line];
      i++;
      while (
        i < lines.length &&
        !/^\s*$/.test(lines[i]) &&
        !lines[i].trimStart().startsWith("```") &&
        !/^(#{1,4})\s+/.test(lines[i]) &&
        !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) &&
        !/^>\s?/.test(lines[i]) &&
        !lines[i].trimStart().startsWith("|")
      ) {
        para.push(lines[i]);
        i++;
      }
      out.push(
        <p key={k} className="text-sm leading-relaxed text-zinc-300">
          {para.map((pl, pi) => (
            <span key={pi}>
              {pi > 0 ? " " : null}
              {renderInline(pl, `${k}-p${pi}`)}
            </span>
          ))}
        </p>,
      );
    }
    return out;
  }, [text]);

  return <div className="space-y-4">{blocks}</div>;
}

export function DocsBrowser({
  documents,
  location,
  initialId,
}: {
  documents: DocumentEntry[];
  location: DocsLocation;
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
            <Markdown text={content} />
          ) : null}
        </div>
      </article>
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
