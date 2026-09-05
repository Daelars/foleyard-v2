import { YardCoreError } from "../errors/yard-core-error";

import type { RegisteredYardCommand } from "./vocabulary";
import { YardCommandValidationError } from "./vocabulary";

function assertNonEmptyCommandId(commandId: string) {
  if (!commandId.trim()) {
    throw new YardCoreError("Command ID must not be empty.");
  }
}

export class YardCommandRegistry {
  private readonly commands = new Map<string, RegisteredYardCommand>();

  register(command: RegisteredYardCommand): void {
    assertNonEmptyCommandId(command.id);

    if (this.commands.has(command.id)) {
      throw new YardCoreError(`Command "${command.id}" is already registered.`);
    }

    this.commands.set(command.id, { ...command });
  }

  unregister(commandId: string): void {
    this.commands.delete(commandId);
  }

  get(commandId: string): RegisteredYardCommand | undefined {
    const command = this.commands.get(commandId);
    return command ? { ...command } : undefined;
  }

  list(): RegisteredYardCommand[] {
    return Array.from(this.commands.values(), (command) => ({ ...command }));
  }

  async execute(commandId: string, input?: unknown): Promise<unknown> {
    const command = this.commands.get(commandId);

    if (!command) {
      throw new YardCoreError(`Command "${commandId}" is not registered.`);
    }

    if (!command.handler) {
      throw new YardCoreError(`Command "${commandId}" does not have a handler.`);
    }

    if (command.inputSchema) {
      const error = command.inputSchema.validate(input);
      if (error) {
        throw new YardCommandValidationError(error);
      }
    }

    return await command.handler();
  }
}
