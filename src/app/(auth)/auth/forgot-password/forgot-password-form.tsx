"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/server/actions/auth";
import { TurnstileWidget } from "@/components/security/turnstile-widget";

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tsReset, setTsReset] = useState(0);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await forgotPasswordAction(form);
      setTsReset((n) => n + 1);
      if (!result.ok) setError(result.error);
      else setDone(true);
    });
  }

  if (done) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        If that email is registered, we&apos;ve sent a reset link. Check your inbox.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <TurnstileWidget resetSignal={tsReset} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
