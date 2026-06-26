"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { softDeleteAccountAction } from "@/server/actions/doctor";

export function DeleteAccountForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Keep the destructive control hidden until the doctor deliberately reveals
  // it — we don't want to encourage account deletion.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        Delete my account
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirm !== "DELETE") {
      setError('Type "DELETE" exactly to confirm.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await softDeleteAccountAction();
      if (!r.ok) setError(r.error);
      else router.push("/");
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 sm:max-w-md">
      <Input
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder='Type "DELETE" to confirm'
        aria-label="Type DELETE to confirm"
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="destructive" disabled={pending || confirm !== "DELETE"}>
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirm("");
            setError(null);
          }}
          disabled={pending}
          className="text-xs text-muted-foreground underline-offset-4 hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
