import { YardCoreError } from "../errors/yard-core-error";

import type { RegisteredYardCommand } from "./extension-command";

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

  async execute(commandId: string): Promise<unknown> {
    const command = this.commands.get(commandId);

    if (!command) {
      throw new YardCoreError(`Command "${commandId}" is not registered.`);
    }

    if (!command.handler) {
      throw new YardCoreError(`Command "${commandId}" does not have a handler.`);
    }

    return await command.handler();
  }
}
