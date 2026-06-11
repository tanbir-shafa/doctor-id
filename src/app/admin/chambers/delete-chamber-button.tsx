"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adminDeleteChamberAction } from "@/server/actions/admin-doctor";

/**
 * Inline two-step delete for a single chamber on the global /admin/chambers
 * list. Mirrors the `SuspendButton` pattern: a transition + `router.refresh()`
 * so the deleted row drops without a full navigation.
 */
export function DeleteChamberButton({
  doctorId,
  chamberId,
  chamberName,
}: {
  doctorId: string;
  chamberId: string;
  chamberName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const r = await adminDeleteChamberAction(doctorId, chamberId);
      if (r.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        title={`Delete ${chamberName}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="gap-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
      >
        <Trash2 className="size-3" aria-hidden="true" />
        Delete
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-600">Delete?</span>
      <Button size="sm" variant="destructive" onClick={confirm} disabled={pending}>
        Yes
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
        ×
      </Button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
