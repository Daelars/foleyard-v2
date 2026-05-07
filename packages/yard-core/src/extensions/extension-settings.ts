export type YardSetting = {
  id: string;
  label: string;
  description?: string;
  type: "boolean" | "string" | "number" | "select" | "path";
  defaultValue: unknown;
  options?: Array<{
    label: string;
    value: string;
  }>;
};
