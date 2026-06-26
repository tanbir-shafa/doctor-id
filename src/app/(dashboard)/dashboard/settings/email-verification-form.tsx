"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { requestEmailVerificationAction } from "@/server/actions/auth";

const PLACEHOLDER_EMAIL_DOMAIN = "@phone.daktar.link";

export function EmailVerificationForm({
  email,
  verified,
}: {
  email: string | null;
  verified: boolean;
}) {
  const hasRealEmail = Boolean(email) && !email!.endsWith(PLACEHOLDER_EMAIL_DOMAIN);
  const displayEmail = hasRealEmail ? email! : null;

  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  // Show the email input when there's no real email yet, or the doctor wants to change it.
  const [editing, setEditing] = useState(!hasRealEmail);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setMsg(null);
    startTransition(async () => {
      const r = await requestEmailVerificationAction(form);
      setMsg(
        r.ok
          ? { tone: "ok", text: "Verification link sent — check your inbox." }
          : { tone: "err", text: r.error },
      );
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          {displayEmail ?? "No email set"}
        </span>
        {hasRealEmail ? (
          verified ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              Verified ✓
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Not verified
            </span>
          )
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        A verified email lets us notify you when your profile or identity is approved.
      </p>

      <form onSubmit={onSubmit} className="grid gap-3 sm:max-w-md">
        {editing ? (
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={displayEmail ?? ""}
              placeholder="you@example.com"
              required={!hasRealEmail}
            />
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending
              ? "Sending…"
              : verified
                ? "Re-send verification link"
                : "Send verification link"}
          </Button>
          {hasRealEmail && !editing ? (
            <Button type="button" variant="outline" onClick={() => setEditing(true)} disabled={pending}>
              Change email
            </Button>
          ) : null}
          {msg ? (
            <p className={msg.tone === "ok" ? "text-sm text-green-600" : "text-sm text-destructive"}>
              {msg.text}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
