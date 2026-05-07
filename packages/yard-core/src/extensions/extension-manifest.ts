import type { YardExtensionCategory } from "./extension-category";
import type { YardCommand } from "./extension-command";
import type { YardPermission } from "./extension-permissions";
import type { YardSetting } from "./extension-settings";
import type { YardSurface } from "./extension-surfaces";

export type YardExtensionManifest = {
  id: string;
  name: string;
  provider: "Foleyard" | "Community";
  version: string;
  description: string;
  category: YardExtensionCategory;
  permissions: YardPermission[];
  commands: YardCommand[];
  settings?: YardSetting[];
  surfaces?: YardSurface[];
};
