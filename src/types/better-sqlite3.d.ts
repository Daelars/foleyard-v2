declare module "better-sqlite3" {
  type Statement = {
    all: (...params: unknown[]) => unknown[];
    get: (...params: unknown[]) => unknown;
    run: (...params: unknown[]) => unknown;
  };

  class Database {
    constructor(filename: string);
    readonly name: string;
    close(): void;
    pragma(statement: string, options?: { simple?: boolean }): unknown;
    exec(sql: string): unknown;
    prepare(sql: string): Statement;
    transaction<TArgs extends unknown[], TResult>(
      fn: (...args: TArgs) => TResult,
    ): (...args: TArgs) => TResult;
  }

  namespace Database {
    export type Database = globalThis.InstanceType<typeof Database>;
    export type { Statement };
  }

  export = Database;
}
