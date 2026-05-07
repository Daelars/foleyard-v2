import type { CommandDefinition } from "./command-types";

export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition<unknown, unknown>>();

  register<TPayload, TResult>(command: CommandDefinition<TPayload, TResult>) {
    this.commands.set(command.id, command as CommandDefinition<unknown, unknown>);
  }

  get<TPayload, TResult>(id: string) {
    return this.commands.get(id) as CommandDefinition<TPayload, TResult> | undefined;
  }

  list() {
    return Array.from(this.commands.values());
  }
}
