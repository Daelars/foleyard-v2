export type YardUiIntent<
  TType extends string = string,
  TPayload = unknown,
> = {
  kind: "yard-ui-intent";
  type: TType;
  payload: TPayload;
};

export function createYardUiIntent<TType extends string, TPayload>(
  type: TType,
  payload: TPayload,
): YardUiIntent<TType, TPayload> {
  return { kind: "yard-ui-intent", type, payload };
}

export function isYardUiIntent(value: unknown): value is YardUiIntent {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "yard-ui-intent" &&
    "type" in value &&
    typeof value.type === "string" &&
    "payload" in value
  );
}
