export interface CommandContext<TPayload = unknown> {
  payload: TPayload;
}

export interface CommandDefinition<TPayload = unknown, TResult = unknown> {
  id: string;
  description?: string;
  execute: (context: CommandContext<TPayload>) => TResult | Promise<TResult>;
}
