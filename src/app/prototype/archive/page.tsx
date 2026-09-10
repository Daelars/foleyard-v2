import { listArchiveArtifacts, resolveArchiveRoot } from "@/lib/archive";

import { ArchiveBrowser } from "./archive-browser";

export const dynamic = "force-dynamic";

/**
 * Dev-only viewer for audit reports, plans and HTML explainers that live
 * in the separate `foleyard-archive` checkout. Content never enters this
 * repository; the viewer resolves the checkout from
 * `FOLEYARD_ARCHIVE_DIR` or the sibling `../foleyard-archive`.
 */
export default function ArchivePage() {
  const resolved = resolveArchiveRoot();

  if (!resolved) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto bg-canvas pb-20">
        <div className="mx-auto w-full max-w-3xl px-4 pt-8 md:px-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-50">
            Archive not configured
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Audits, plans and HTML explainers live in the separate archive
            repository. Point the viewer at a checkout with{" "}
            <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[12px] text-zinc-100">
              FOLEYARD_ARCHIVE_DIR
            </code>
            , or clone the archive next to this workspace:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 font-mono text-[12px] leading-relaxed text-zinc-200">
            git clone https://github.com/Daelars/foleyard-archive ../foleyard-archive
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-canvas pb-20">
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 md:px-6">
        <h1 className="text-5xl font-extrabold tracking-tighter text-zinc-50">Archive</h1>
        <p className="mt-1.5 max-w-2xl text-sm font-medium text-zinc-400">
          Audit reports, plans and HTML explainers from the separate archive
          checkout. Dev only — nothing here ships.
        </p>
        <div className="mt-6">
          <ArchiveBrowser
            entries={listArchiveArtifacts()}
            rootPath={resolved.root}
            source={resolved.source}
          />
        </div>
      </div>
    </div>
  );
}
