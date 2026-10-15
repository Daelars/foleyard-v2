import type { DesktopActionResult, DesktopPickerPurpose } from "@/lib/desktop";

/**
 * The one picker-to-grant flow (Application context, #263).
 *
 * Every extension that needs a source or destination folder runs the same
 * two steps: ask the native picker for a single-use proof, then spend that
 * proof at the matching grant route. The renderer never sends a directory
 * path as consent, so a path the user did not pick always fails. Make Pack
 * (destination) and Library Gatherer (source and destination) both call
 * this, so the flow can only be implemented once.
 */

export type PickerGrantBridge = {
  pickFolder: (purpose: DesktopPickerPurpose) => Promise<DesktopActionResult>;
};

export type PickerGrantResult =
  | { ok: true; grantId: string; path: string }
  | { ok: false; error: string };

type GrantBody = {
  ok?: boolean;
  grantId?: string;
  path?: string;
  error?: { message?: string };
};

export async function pickV2Grant(
  bridge: PickerGrantBridge | null | undefined,
  extensionId: string,
  grantKind: DesktopPickerPurpose["grantKind"],
): Promise<PickerGrantResult> {
  if (!bridge) {
    return { ok: false, error: "Folder picker requires the desktop app" };
  }
  const picked = await bridge.pickFolder({ extensionId, grantKind });
  if (!picked?.ok || !picked.proof) {
    return { ok: false, error: picked?.error ?? "Folder picker failed" };
  }

  const route =
    grantKind === "source"
      ? "/api/extensions-v2/source-grants"
      : "/api/extensions-v2/grants";
  let response: Response;
  try {
    response = await fetch(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ extensionId, proof: picked.proof }),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Grant request failed" };
  }

  const body = (await response.json().catch(() => null)) as GrantBody | null;
  if (!response.ok || !body?.ok || !body.grantId) {
    return { ok: false, error: body?.error?.message ?? "Grant request failed" };
  }
  return { ok: true, grantId: body.grantId, path: body.path ?? picked.path ?? "" };
}
