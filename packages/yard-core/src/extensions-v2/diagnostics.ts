import { YardCoreError } from "../errors/yard-core-error";

/** Machine-checkable reason a v2 definition was rejected. */
export type ExtensionV2DiagnosticCode =
  | "malformed-extension-id"
  | "malformed-extension-version"
  | "malformed-extension-field"
  | "unsupported-api-version"
  | "duplicate-extension-id"
  | "duplicate-command-id"
  | "duplicate-setting-id"
  | "duplicate-contribution-id"
  | "duplicate-docs-ref-id"
  | "unowned-command-id"
  | "unowned-setting-id"
  | "unowned-contribution-id"
  | "malformed-command"
  | "malformed-setting-default"
  | "malformed-setting-options"
  | "malformed-schema"
  | "unresolved-command-ref"
  | "unknown-permission"
  | "unsupported-command-scope"
  | "unsupported-contribution-type"
  | "no-commands";

export type ExtensionV2Diagnostic = {
  code: ExtensionV2DiagnosticCode;
  /** Actionable: what is wrong, where, and how to fix it. */
  message: string;
  extensionId?: string;
  entryId?: string;
};

/**
 * Thrown by registration when a definition fails validation. Carries every
 * diagnostic found so authors fix all problems in one pass instead of
 * re-registering per error.
 */
export class ExtensionV2RegistrationError extends YardCoreError {
  readonly diagnostics: ExtensionV2Diagnostic[];

  constructor(diagnostics: ExtensionV2Diagnostic[]) {
    super(
      diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
      "EXTENSION_V2_REGISTRATION_FAILED",
    );
    this.name = "ExtensionV2RegistrationError";
    this.diagnostics = [...diagnostics];
  }
}
