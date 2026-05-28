"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { suspendDoctorAction } from "@/server/actions/verification";

export function SuspendButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!reason.trim()) return;
    startTransition(async () => {
      const r = await suspendDoctorAction(slug, reason.trim());
      if (r.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Suspend</Button>;

  return (
    <div className="flex gap-2">
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason"
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      />
      <Button size="sm" variant="destructive" onClick={submit} disabled={pending}>OK</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>×</Button>
    </div>
  );
}
