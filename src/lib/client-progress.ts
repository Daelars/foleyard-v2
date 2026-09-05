export async function readProgressResponse<T>(response: Response, onProgress: (progress: { completed: number; total: number }) => void): Promise<T> {
  if (!response.ok || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? body.message ?? "Request failed");
    return body;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Scan response has no body");
  const decoder = new TextDecoder(); let pending = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n"); pending = lines.pop() ?? "";
      if (done && pending) lines.push(pending);
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === "error") throw new Error(event.error);
        if (event.type === "progress") onProgress({ completed: event.completed, total: event.total });
        if (event.type === "result") return event.result as T;
      }
      if (done) throw new Error("Scan ended without a report");
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
}
