// THROWAWAY: serve the standalone blog-posts reading room on the prototype route.
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response("Prototype available in development only", { status: 404 });
  }
  const html = await readFile(
    path.join(process.cwd(), "src/app/prototype/blog/index.html"),
    "utf8",
  );
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
