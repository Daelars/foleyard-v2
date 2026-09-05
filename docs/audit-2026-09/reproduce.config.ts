import { defineConfig } from "vitest/config";
import base from "../../vitest.config";

export default defineConfig({ ...base, test: { ...base.test, include: ["docs/audit-2026-09/reproduce.test.ts"] } });
