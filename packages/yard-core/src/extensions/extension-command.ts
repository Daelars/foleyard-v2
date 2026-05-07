export type YardCommandScope =
  | "global"
  | "selection"
  | "folder"
  | "file"
  | "collection"
  | "drop";

export type YardCommand = {
  id: string;
  title: string;
  description: string;
  scope: YardCommandScope;
  destructive?: boolean;
  requiresSelection?: boolean;
};

export type RegisteredYardCommand = YardCommand & {
  handler?: () => Promise<unknown> | unknown;
};
