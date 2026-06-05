"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPublishStatusAction } from "@/server/actions/doctor";
import type { DoctorStatus } from "@/types/doctor";

type SubmitResult = { ok: true } | { ok: false; error: string };
type SubmitAction = (publish: boolean) => Promise<SubmitResult>;

export function PublishToggle({
  initialStatus,
  submitAction,
  approved = true,
}: {
  initialStatus: DoctorStatus;
  submitAction?: SubmitAction;
  /** When false, publishing is locked (admin hasn't approved yet). Unpublish still allowed. */
  approved?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const published = status === "published";
  // Publishing is locked until approved; unpublishing a (somehow) published
  // profile is always allowed.
  const publishLocked = !approved && !published;

  function flip() {
    setError(null);
    startTransition(async () => {
      const next = !published;
      const action = submitAction ?? setPublishStatusAction;
      const result = await action(next);
      if (result.ok) setStatus(next ? "published" : "draft");
      else setError(result.error);
    });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-foreground">
            Profile is {published ? "published" : "a draft"}
          </p>
          <p className="text-sm text-muted-foreground">
            {published
              ? "Patients can find you in search and through your profile URL."
              : publishLocked
                ? "Publishing unlocks once an admin approves your account (usually within 24 hours). You can edit and preview it meanwhile."
                : "Your profile is hidden from public search and search engines."}
          </p>
        </div>
        <Button
          onClick={flip}
          disabled={pending || publishLocked}
          variant={published ? "outline" : "default"}
          title={publishLocked ? "Publishing unlocks after admin approval" : undefined}
        >
          {published ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          {pending ? "…" : published ? "Unpublish" : "Publish"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
