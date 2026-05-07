import type { YardExtensionContext } from "./extension-context";
import type { YardExtensionManifest } from "./extension-manifest";

export type YardExtensionDefinition = {
  manifest: YardExtensionManifest;
  registerCommands?: (context: YardExtensionContext) => void;
  createService?: (context: YardExtensionContext) => unknown;
};
