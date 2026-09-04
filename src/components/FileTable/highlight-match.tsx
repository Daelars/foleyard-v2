function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightMatch(text: string, query: string): React.ReactNode {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return text;
  const escaped = escapeRegex(normalizedQuery);
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === normalizedQuery.toLowerCase() ? (
      <mark
        key={index}
        className="rounded-sm bg-accent-fill/30 px-0.5 text-zinc-50"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
