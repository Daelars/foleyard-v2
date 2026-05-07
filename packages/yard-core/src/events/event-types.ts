export interface YardCoreEvent<TPayload = unknown> {
  type: string;
  payload: TPayload;
}
