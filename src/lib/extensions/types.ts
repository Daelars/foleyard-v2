export type ExtensionGridItem = {
  id: string;
  name: string;
  provider: string;
  version: string;
  description: string;
  category: string;
  enabled: boolean;
  commandCount?: number;
  permissionCount?: number;
  surfaceCount?: number;
  commands?: Array<{
    id: string;
    title: string;
  }>;
  permissions?: string[];
  surfaces?: string[];
  settingsCount?: number;
  settings?: Array<{
    id: string;
    label: string;
    description?: string;
    type: "boolean" | "string" | "number" | "select" | "path";
    defaultValue: unknown;
    value: unknown;
    options?: Array<{
      label: string;
      value: string;
    }>;
  }>;
};
