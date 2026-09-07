import { describe, expect, it } from "vitest";

import {
  redactV2Json,
  redactV2Text,
  V2_DIAGNOSTIC_MAX_RECORDS,
  V2_DIAGNOSTIC_MAX_STRING,
} from "./redact";

// Area: extension v2 R9 (#172). Exported diagnostics follow the privacy
// rules: paths, settings values, tokens, secrets, and stacks redact;
// correlation IDs survive; storage stays bounded.

describe("redactV2Text", () => {
  it("redacts Windows and Unix paths but preserves invocation/job IDs", () => {
    const message =
      "vinv_abc failed on C:\\Users\\ada\\Music\\x.mp3 and /home/ada/sounds/y.mp3 (job vjob_123)";
    const redacted = redactV2Text(message);
    expect(redacted).not.toContain("C:\\Users");
    expect(redacted).not.toContain("/home/ada");
    expect(redacted).toContain("vinv_abc");
    expect(redacted).toContain("vjob_123");
  });

  it("redacts tokens, secrets, and bearer credentials", () => {
    const redacted = redactV2Text(
      'token="tok_abcdef123456" secret: hunter2 password=correct-horse Authorization Bearer eyJhbGciOiJIUzI1NiJ9',
    );
    expect(redacted).not.toContain("tok_abcdef123456");
    expect(redacted).not.toContain("hunter2");
    expect(redacted).not.toContain("correct-horse");
    expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(redacted).toContain("[redacted]");
  });

  it("redacts setting assignments and stack frames", () => {
    const redacted = redactV2Text(
      'Error: boom\n    at run (C:\\app\\host.ts:10:5)\nsetting "fixture.key": super-secret-value',
    );
    expect(redacted).not.toContain("at run");
    expect(redacted).not.toContain("host.ts:10:5");
    expect(redacted).not.toContain("super-secret-value");
    expect(redacted).toContain("boom");
  });

  it("bounds long strings with an explicit marker", () => {
    const redacted = redactV2Text("x".repeat(V2_DIAGNOSTIC_MAX_STRING + 50));
    expect(redacted.length).toBeLessThanOrEqual(
      V2_DIAGNOSTIC_MAX_STRING + "…[truncated]".length,
    );
    expect(redacted.endsWith("…[truncated]")).toBe(true);
  });

  it("is idempotent on already-redacted text", () => {
    const once = redactV2Text("failed on C:\\tmp\\x (job vjob_1)");
    expect(redactV2Text(once)).toBe(once);
  });
});

describe("redactV2Json", () => {
  it("redacts secret-valued keys and nested strings", () => {
    const redacted = redactV2Json({
      jobId: "vjob_1",
      grantToken: "tok_secret",
      nested: { message: "read C:\\tmp\\a.mp3" },
    }) as Record<string, unknown>;
    expect(redacted.jobId).toBe("vjob_1");
    expect(redacted.grantToken).toBe("[redacted]");
    expect(String((redacted.nested as Record<string, unknown>).message)).not.toContain(
      "C:\\tmp",
    );
  });

  it("caps the record budget constant at a bounded value", () => {
    expect(V2_DIAGNOSTIC_MAX_RECORDS).toBeLessThanOrEqual(100);
  });
});
