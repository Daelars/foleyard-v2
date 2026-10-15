import type { V2PickerGrantKind, V2PickerProof } from "@yard-core";

import { issueV2DestinationGrant } from "./filesystem";
import { getV2Runtime } from "./runtime";
import { issueV2SourceGrant } from "./source-grants";

/**
 * Application picker-proof bridge (Application context, #263).
 *
 * The desktop process mints a proof with the folder picker; an extension
 * grant route spends it here. Proofs belong to the process-wide runtime so
 * the desktop-grants bundle that mints one and the grant bundle that spends
 * it share a single store, exactly like the grant stores beside them. A
 * caller-supplied directory path never reaches this module: only a proof the
 * picker actually minted can issue a grant, and only for the extension and
 * kind it was minted for.
 */

export function getV2PickerProofStore() {
  return getV2Runtime().pickerProofs;
}

/** Mint the single-use proof the picker returns to the renderer. */
export function mintV2PickerProof(
  extensionId: string,
  kind: V2PickerGrantKind,
  path: string,
): V2PickerProof {
  return getV2PickerProofStore().issue(extensionId, kind, path);
}

export type V2GrantFromPickerProof =
  | { ok: true; grantId: string; path: string }
  | { ok: false; status: number; code: string; message: string };

/**
 * Spend a picker proof for one extension and grant kind and issue the grant
 * the handler consumes. A proof that is foreign, expired, replayed, or never
 * minted denies with 403.
 */
export async function issueV2GrantFromPickerProof(
  extensionId: string,
  kind: V2PickerGrantKind,
  proof: string,
): Promise<V2GrantFromPickerProof> {
  const spent = getV2PickerProofStore().consume(proof, extensionId, kind);
  if (!spent.ok) {
    return { ok: false, status: 403, code: "grant-denied", message: spent.message };
  }
  try {
    const issued =
      kind === "source"
        ? await issueV2SourceGrant(extensionId, spent.proof.path)
        : await issueV2DestinationGrant(extensionId, spent.proof.path);
    return { ok: true, grantId: issued.grantId, path: issued.path };
  } catch (error) {
    return {
      ok: false,
      status: 400,
      code: "input-invalid",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
