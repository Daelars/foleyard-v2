import { describe, expect, it } from "vitest";

import { V2PickerProofStore } from "./index";

// Area: #263. A picker proof is the one thing that turns a folder path
// into consent: the native picker mints it, and an extension grant route
// exchanges it, once, for a grant bound to exactly one extension and one
// grant kind. Missing, expired, foreign, replayed, or arbitrary proofs
// deny, so a caller-supplied path is never access.

const ISSUER = "make-pack-v2";
const OTHER = "library-gatherer-v2";
const PATH = "/chosen/out";

function fixedClock(now: { value: string }) {
  return () => now.value;
}

describe("V2PickerProofStore", () => {
  it("issues an opaque, extension- and kind-scoped proof for the picked path", () => {
    const store = new V2PickerProofStore(() => "2026-09-06T00:00:00.000Z");
    const proof = store.issue(ISSUER, "destination", PATH);

    expect(proof.proof).toEqual(expect.any(String));
    expect(proof.proof).not.toContain(PATH);
    expect(proof.path).toBe(PATH);
    expect(proof.extensionId).toBe(ISSUER);
    expect(proof.kind).toBe("destination");

    const consumed = store.consume(proof.proof, ISSUER, "destination");
    expect(consumed.ok).toBe(true);
    if (consumed.ok) expect(consumed.proof.path).toBe(PATH);
  });

  it("rejects a missing or arbitrary proof", () => {
    const store = new V2PickerProofStore(() => "2026-09-06T00:00:00.000Z");
    const missing = store.consume(undefined, ISSUER, "destination");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("proof-missing");

    const arbitrary = store.consume("not-minted-by-the-picker", ISSUER, "destination");
    expect(arbitrary.ok).toBe(false);
    if (!arbitrary.ok) expect(arbitrary.reason).toBe("proof-missing");
  });

  it("rejects a replayed proof", () => {
    const store = new V2PickerProofStore(() => "2026-09-06T00:00:00.000Z");
    const proof = store.issue(ISSUER, "destination", PATH);
    expect(store.consume(proof.proof, ISSUER, "destination").ok).toBe(true);

    const replay = store.consume(proof.proof, ISSUER, "destination");
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe("proof-missing");
  });

  it("rejects a foreign proof without spending it on the wrong extension or kind", () => {
    const store = new V2PickerProofStore(() => "2026-09-06T00:00:00.000Z");
    const proof = store.issue(ISSUER, "destination", PATH);

    const foreignExtension = store.consume(proof.proof, OTHER, "destination");
    expect(foreignExtension.ok).toBe(false);
    if (!foreignExtension.ok) expect(foreignExtension.reason).toBe("proof-foreign");

    const foreignKind = store.consume(proof.proof, ISSUER, "source");
    expect(foreignKind.ok).toBe(false);
    if (!foreignKind.ok) expect(foreignKind.reason).toBe("proof-foreign");

    // The intended caller can still spend it.
    expect(store.consume(proof.proof, ISSUER, "destination").ok).toBe(true);
  });

  it("rejects an expired proof and prunes it", () => {
    const now = { value: "2026-09-06T00:00:00.000Z" };
    const store = new V2PickerProofStore(fixedClock(now));
    const proof = store.issue(ISSUER, "destination", PATH, { ttlMs: 60_000 });
    expect(store.consume(proof.proof, ISSUER, "destination", "2026-09-06T00:00:30.000Z").ok).toBe(
      true,
    );

    const stale = store.issue(ISSUER, "destination", PATH, { ttlMs: 60_000 });
    now.value = "2026-09-06T01:00:00.000Z";
    const expired = store.consume(stale.proof, ISSUER, "destination");
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.reason).toBe("proof-expired");

    const pruned = store.consume(stale.proof, ISSUER, "destination");
    expect(pruned.ok).toBe(false);
    if (!pruned.ok) expect(pruned.reason).toBe("proof-missing");
  });
});
