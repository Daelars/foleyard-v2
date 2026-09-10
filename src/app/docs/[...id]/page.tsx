import { notFound } from "next/navigation";

import { DesktopTitleBar } from "@/components/DesktopTitleBar";
import { DOCUMENT_REGISTRY, getDocumentationLocation } from "@/lib/documentation";
import { DocsBrowser, DocsHeader } from "../docs-browser";

export const dynamic = "force-dynamic";

export default async function DocDetailPage({
  params,
}: {
  params: Promise<{ id: string[] }>;
}) {
  const segments = (await params).id ?? [];
  const documentId = segments.join("/");
  const entry = DOCUMENT_REGISTRY.find((d) => d.id === documentId);
  if (!entry) notFound();

  const location = getDocumentationLocation();
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-canvas font-sans">
      {/* No gradient wash: this page owns its scroll container, and a
          viewport-sized oklab gradient re-rasters on every scroll frame.
          Flat canvas instead. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <DesktopTitleBar />
        <main className="mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-y-auto px-4 pb-10 pt-6 md:px-6">
          <DocsHeader count={DOCUMENT_REGISTRY.length} />
          <p className="mt-1.5 max-w-2xl text-sm font-medium text-zinc-400">
            Every live guide in the version-matched set ({location.manifestId} v{location.productVersion}).
            Select a guide to read it; each has a shareable /docs link.
          </p>
          <div className="mt-6">
            <DocsBrowser
              documents={DOCUMENT_REGISTRY}
              location={{
                manifestId: location.manifestId,
                productVersion: location.productVersion,
                matched: location.matched,
              }}
              initialId={documentId}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
