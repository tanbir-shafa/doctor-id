"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportProfileAction } from "@/server/actions/doctor";

export function ReportButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (reason.trim().length < 10) {
      setError("Please give us at least a sentence describing the issue.");
      return;
    }
    startTransition(async () => {
      const result = await reportProfileAction({ slug, reason: reason.trim() });
      if (!result.ok) setError(result.error);
      else setDone(true);
    });
  }

  if (done) {
    return (
      <p className="text-xs text-muted-foreground">Thanks — we&apos;ll review this profile.</p>
    );
  }

  return (
    <div className="text-xs text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
      >
        <Flag className="size-3.5" aria-hidden="true" />
        Report this profile
      </button>
      {open ? (
        <div className="mt-3 space-y-2 rounded-md border border-border bg-card p-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="What's wrong with this profile? (e.g. impersonation, incorrect credentials)"
            className="w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error ? <p className="text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="button" onClick={submit} disabled={pending}>
              {pending ? "Sending…" : "Submit report"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
