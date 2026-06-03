"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markEmrReadyAction } from "@/server/actions/emr";

/**
 * Inline "Mark ready" form rendered per row of the EMR queue.
 *
 * The admin pastes the EMR-side email they just provisioned and clicks
 * "Mark ready"; the row's User row gets `emr.seatStatus = 'ready'` and the
 * doctor's dashboard banner flips on next load.
 */
export function MarkReadyForm({
  userId,
  suggestedEmail,
}: {
  userId: string;
  suggestedEmail: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(suggestedEmail);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await markEmrReadyAction({ userId, emrAccountEmail: email.trim() });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="EMR login email"
        required
        className="h-9 sm:w-64"
      />
      <Button type="submit" size="sm" disabled={pending}>
        <CheckCircle2 className="size-4" aria-hidden="true" />
        {pending ? "Saving…" : "Mark ready"}
      </Button>
      {error ? <p className="text-xs text-destructive sm:ml-2">{error}</p> : null}
    </form>
  );
}
