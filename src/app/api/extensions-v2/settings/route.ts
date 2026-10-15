import { NextResponse } from "next/server";

import { buildAppV2Catalog, isV2ExtensionEnabled } from "@/lib/extensions-v2/host";
import { getV2PolicyHealth } from "@/lib/extensions-v2/runtime";
import { buildV2SettingsCatalog } from "@/lib/extensions-v2/settings-read";
import { createV2AuthoredSettings } from "@/lib/extensions-v2/settings-state";

export const dynamic = "force-dynamic";

/**
 * GET /api/extensions-v2/settings — one batched read of every
 * registered extension's enablement, declared/effective permissions and
 * authored settings (#295). Replaces the previous one-request-per-panel
 * fan-out when Settings mounted every panel. Data only; never executes.
 *
 * Partial failure is reported per entry: an extension whose settings
 * could not be read stays in the list as `status: "degraded"` with a
 * reason instead of disappearing. A failure building the whole catalog is
 * a 500, which the client renders as a recoverable catalog failure rather
 * than an unexplained empty page. `policyHealth` carries the #266
 * permission/enablement degraded state.
 */
export async function GET() {
  try {
    const catalog = buildAppV2Catalog();
    const extensions = buildV2SettingsCatalog({
      entries: catalog.entries,
      isEnabled: isV2ExtensionEnabled,
      readSettings: (extensionId, declarations) => {
        const store = createV2AuthoredSettings(extensionId, declarations);
        const rows = declarations.map((declaration) => ({
          declaration,
          value: store.get(declaration.id),
        }));
        const diagnosis = store.diagnose();
        return {
          rows,
          degradedReason: diagnosis.length
            ? diagnosis.map((entry) => entry.reason).join(" ")
            : null,
        };
      },
    });
    return NextResponse.json({
      ok: true,
      policyHealth: getV2PolicyHealth(),
      extensions,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "settings-unavailable",
          message: `Extension settings could not be read: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      },
      { status: 500 },
    );
  }
}
