"use client";

import { useMemo } from "react";
import Link from "next/link";

// Minimal markdown renderer: headings, tables, lists, code fences,
// blockquotes, bold, inline code, links. No dependencies. Shared by the
// documentation browser and the dev-only archive viewer.
//
// `linkFor` lets the docs browser rewrite relative document links to
// in-app `/docs/<id>` routes (#250); when it returns null the original
// href is kept (external links, anchors, absolute paths).
export type MarkdownLinkResolver = (href: string) => string | null;

function renderInline(
  text: string,
  keyPrefix: string,
  linkFor?: MarkdownLinkResolver,
): React.ReactNode[] {
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
        const rewritten = linkFor?.(href) ?? href;
        const className =
          "text-accent-text underline decoration-accent-fill/50 underline-offset-2 hover:decoration-accent-fill";
        if (rewritten.startsWith("/docs/")) {
          parts.push(
            <Link key={key} href={rewritten} className={className}>
              {label}
            </Link>,
          );
        } else {
          const external = /^https?:\/\//.test(rewritten);
          parts.push(
            <a
              key={key}
              href={rewritten}
              {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
              className={className}
            >
              {label}
            </a>,
          );
        }
      } else {
        parts.push(token);
      }
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function Markdown({
  text,
  linkFor,
}: {
  text: string;
  linkFor?: MarkdownLinkResolver;
}) {
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
                      {renderInline(cell, `${fence}-h${ci}`, linkFor)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="odd:bg-transparent even:bg-white/[0.02]">
                    {row.map((cell, ci) => (
                      <td key={ci} className="border-b border-white/5 px-3 py-2 text-zinc-300">
                        {renderInline(cell, `${fence}-r${ri}c${ci}`, linkFor)}
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
        out.push(<Tag key={k} className={cls}>{renderInline(body, k, linkFor)}</Tag>);
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
              <p key={qi}>{renderInline(q, `${k}-q${qi}`, linkFor)}</p>
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
              <li key={ii}>{renderInline(item, `${k}-li${ii}`, linkFor)}</li>
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
              {renderInline(pl, `${k}-p${pi}`, linkFor)}
            </span>
          ))}
        </p>,
      );
    }
    return out;
  }, [text, linkFor]);

  return <div className="space-y-4">{blocks}</div>;
}
