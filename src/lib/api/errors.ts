import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function errorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}
export function mutationError(error: unknown) {
  console.error("Mutation failed", error);
  if (error instanceof ApiError) return errorResponse(error.message, error.status);
  if (error instanceof SyntaxError) return errorResponse("Request body must be valid JSON", 400);
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code.includes("CONSTRAINT_UNIQUE")) return errorResponse("That name already exists", 409);
  if (code.includes("CONSTRAINT_FOREIGNKEY")) return errorResponse("Referenced file, tag, or collection does not exist", 404);
  if (code.startsWith("SQLITE_CONSTRAINT")) return errorResponse("Request violates a data constraint", 400);
  return errorResponse("Request failed", 500);
}
