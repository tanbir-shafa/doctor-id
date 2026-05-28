"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPublishStatusAction } from "@/server/actions/doctor";
import type { DoctorStatus } from "@/types/doctor";

export function PublishToggle({ initialStatus }: { initialStatus: DoctorStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();
  const published = status === "published";

  function flip() {
    startTransition(async () => {
      const next = !published;
      const result = await setPublishStatusAction(next);
      if (result.ok) setStatus(next ? "published" : "draft");
    });
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
      <div>
        <p className="font-medium text-foreground">
          Profile is {published ? "published" : "a draft"}
        </p>
        <p className="text-sm text-muted-foreground">
          {published
            ? "Patients can find you in search and through your profile URL."
            : "Your profile is hidden from public search and search engines."}
        </p>
      </div>
      <Button onClick={flip} disabled={pending} variant={published ? "outline" : "default"}>
        {published ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        {pending ? "…" : published ? "Unpublish" : "Publish"}
      </Button>
    </div>
  );
}
