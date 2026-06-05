"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Read-only referral link + copy button. Selecting the input is the fallback
 * when the async Clipboard API is unavailable (older/insecure contexts).
 */
export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the input is still selectable as a fallback.
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="h-10 flex-1 rounded-md border border-input bg-muted/40 px-3 text-sm"
        aria-label="Your referral link"
      />
      <Button type="button" onClick={copy} className="shrink-0 gap-1.5">
        {copied ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
