"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/server/actions/auth";

/**
 * Email + password sign-in. Used by admins and any user who has set an email +
 * password; `loginAction` returns the role-appropriate landing page (/admin for
 * admins, /dashboard otherwise). Doctors without a password use the phone+OTP
 * flow at /auth/login.
 */
export function EmailLoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(initialError ?? null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (next) form.set("next", next);
    setError(null);
    startTransition(async () => {
      const result = await loginAction(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(result.data?.next ?? "/dashboard");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
