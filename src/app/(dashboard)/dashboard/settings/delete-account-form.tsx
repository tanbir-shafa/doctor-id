"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { softDeleteAccountAction } from "@/server/actions/doctor";

export function DeleteAccountForm() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
      <Button type="submit" variant="destructive" disabled={pending || confirm !== "DELETE"}>
        {pending ? "Deleting…" : "Delete my account"}
      </Button>
    </form>
  );
}
