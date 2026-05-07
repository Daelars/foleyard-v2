export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={index}
        className="rounded-sm bg-primary/30 px-0.5 text-primary-foreground"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}
