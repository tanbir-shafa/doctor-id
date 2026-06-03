"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addOptOutAction, removeOptOutAction } from "@/server/actions/outbound";

/**
 * Inline forms for the OptOut roster — add by phone, remove by row.
 */
export function AddOptOutForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await addOptOutAction({ phone, reason });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPhone("");
      setReason("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="01712345678"
        required
        className="h-9 sm:w-40"
      />
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        maxLength={200}
        className="h-9 sm:flex-1"
      />
      <Button type="submit" size="sm" disabled={pending}>
        <Plus className="size-4" aria-hidden="true" />
        {pending ? "Adding…" : "Add opt-out"}
      </Button>
      {error ? <p className="text-xs text-destructive sm:ml-2">{error}</p> : null}
    </form>
  );
}

export function RemoveOptOutButton({ phone }: { phone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const r = await removeOptOutAction({ phone });
      if (r.ok) router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={pending}
      aria-label={`Remove opt-out for ${phone}`}
    >
      <Trash2 className="size-4 text-destructive" aria-hidden="true" />
    </Button>
  );
}
