declare module "better-sqlite3" {
  class Database {
    constructor(filename: string);
    pragma(statement: string): unknown;
    exec(sql: string): unknown;
    prepare(sql: string): {
      all: (...params: unknown[]) => unknown[];
      get: (...params: unknown[]) => unknown;
      run: (...params: unknown[]) => unknown;
    };
    transaction<TArgs extends unknown[], TResult>(
      fn: (...args: TArgs) => TResult,
    ): (...args: TArgs) => TResult;
  }

  namespace Database {
    export type Database = globalThis.InstanceType<typeof Database>;
  }

  export = Database;
}
