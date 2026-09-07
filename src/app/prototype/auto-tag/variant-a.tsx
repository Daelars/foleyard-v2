// PROTOTYPE ONLY — variant A: the rules engine face, built from shadcn primitives.
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { filenameMatchesToken } from "./data";
import type { MockFile, TagRule } from "./data";

export function VariantA({
  files,
  rules,
  autoOn,
  query,
  onAddRule,
}: {
  files: MockFile[];
  rules: TagRule[];
  autoOn: boolean;
  query: string;
  onAddRule: (tok: string, tags: string[]) => void;
}) {
  const [tok, setTok] = useState("");
  const [tags, setTags] = useState("");
  const q = query.trim().toLowerCase();
  const visible = rules.filter(
    (rule) =>
      !q || rule.tok.includes(q) || rule.tags.some((tag) => tag.includes(q)),
  );

  return (
    <div className="space-y-3">
      {visible.map((rule) => {
        const hits = files.filter((file) => filenameMatchesToken(file.filename, rule.tok)).length;
        return (
          <Card key={rule.tok}>
            <CardContent className="flex flex-wrap items-center gap-2 py-3">
              <code className="font-mono text-sm font-bold text-zinc-100">{rule.tok}</code>
              <span className="text-zinc-600">→</span>
              {rule.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  #{tag}
                </Badge>
              ))}
              <span className="flex-1" />
              <span className="font-mono text-[11px] text-zinc-500">
                {hits} filename hit{hits === 1 ? "" : "s"}
                {!autoOn && " · idle (switch off)"}
              </span>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 py-3">
          <Input
            value={tok}
            onChange={(event) => setTok(event.target.value)}
            placeholder="word, e.g. horse"
            aria-label="Rule token"
            className="w-40"
          />
          <Input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="tags, e.g. horse, animal"
            aria-label="Rule tags"
            className="w-56"
          />
          <Button
            size="sm"
            onClick={() => {
              onAddRule(tok, tags.split(","));
              setTok("");
              setTags("");
            }}
          >
            Add rule
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
