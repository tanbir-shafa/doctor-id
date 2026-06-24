"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addOptOutAction, removeOptOutAction } from "@/server/actions/outbound";

type Channel = "sms" | "email";

/**
 * Inline forms for the OptOut roster — add by phone (SMS) or email, remove by row.
 */
export function AddOptOutForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<Channel>("sms");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await addOptOutAction(
        channel === "email"
          ? { channel, email: value, reason }
          : { channel, phone: value, reason },
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setValue("");
      setReason("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <select
        value={channel}
        onChange={(e) => setChannel(e.target.value as Channel)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm sm:w-24"
        aria-label="Channel"
      >
        <option value="sms">SMS</option>
        <option value="email">Email</option>
      </select>
      <Input
        type={channel === "email" ? "email" : "tel"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={channel === "email" ? "doctor@example.com" : "01712345678"}
        required
        className="h-9 sm:w-52"
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

export function RemoveOptOutButton({
  channel,
  value,
}: {
  channel: Channel;
  value: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const r = await removeOptOutAction(
        channel === "email" ? { channel, email: value } : { channel, phone: value },
      );
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
      aria-label={`Remove opt-out for ${value}`}
    >
      <Trash2 className="size-4 text-destructive" aria-hidden="true" />
    </Button>
  );
}
