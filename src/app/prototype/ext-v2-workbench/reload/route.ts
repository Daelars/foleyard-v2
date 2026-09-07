import { NextResponse } from "next/server";

import { buildAppV2Catalog, getV2Registry } from "@/lib/extensions-v2/host";
import { ensureV2DevFixtureHandlers } from "../fixture-handlers";

export const dynamic = "force-dynamic";

/**
 * POST /prototype/ext-v2-workbench/reload — dev-only explicit reload.
 *
 * Re-runs fixture registration through the production registry path
 * (each ID registers at most once, so dev reloads never duplicate
 * contributions or handlers) and re-attaches fixture handlers
 * idempotently. Returns which handlers attached on this call: a
 * second reload attaches none. Production builds 404 here; the
 * prototype layout additionally resolves workbench pages to
 * not-found, and packaged builds exclude the compiled prototype
 * routes via electron-builder.yml.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: { code: "not-found", message: "Not found." } },
      { status: 404 },
    );
  }
  const { handlers } = ensureV2DevFixtureHandlers();
  const catalog = buildAppV2Catalog();
  return NextResponse.json({
    ok: true,
    attachedHandlers: handlers,
    entryCount: catalog.entries.length,
    fixtureIds: getV2Registry()
      .list()
      .map((definition) => definition.id)
      .filter((id) => id.startsWith("fixture-")),
  });
}
