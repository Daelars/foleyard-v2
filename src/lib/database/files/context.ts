import type Database from "better-sqlite3";
import type { drizzle } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/lib/schema";

export type FileRepositoryContext = { sqlite: Database; db: ReturnType<typeof drizzle<typeof schema>> };
