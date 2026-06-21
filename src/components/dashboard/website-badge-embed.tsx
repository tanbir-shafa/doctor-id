"use client";

import { useState } from "react";
import type { BadgeSnippet } from "@/lib/seo/embed-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Doctor-facing UI for the "Add to your website" badges (SEO task 36). Shows a
 * live preview of each variant + the paste-ready HTML with a copy button.
 */
export function WebsiteBadgeEmbed({ snippets }: { snippets: BadgeSnippet[] }) {
  return (
    <div className="space-y-5">
      {snippets.map((s) => (
        <BadgeCard key={s.id} snippet={s} />
      ))}
    </div>
  );
}

function BadgeCard({ snippet }: { snippet: BadgeSnippet }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the code stays selectable below */
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{snippet.label}</CardTitle>
        <CardDescription>{snippet.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Live preview of exactly what will render on the doctor's site. */}
        <div className="flex items-center justify-center rounded-lg border border-border bg-muted/30 p-5">
          <div dangerouslySetInnerHTML={{ __html: snippet.html }} />
        </div>
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg border border-border bg-card p-3 pr-16 text-xs text-muted-foreground">
            <code>{snippet.html}</code>
          </pre>
          <button
            type="button"
            onClick={copy}
            className="absolute right-2 top-2 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
