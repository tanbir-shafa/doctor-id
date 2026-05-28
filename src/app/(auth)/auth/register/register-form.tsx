"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction } from "@/server/actions/auth";

export function RegisterForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await registerAction(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        `Account created. We sent a verification link to ${result.data?.email}. After verifying, sign in to start filling out your profile.`,
      );
      // Soft redirect after a short delay so users can read the success message.
      setTimeout(() => router.push("/auth/login?next=/dashboard"), 2500);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" autoComplete="given-name" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" autoComplete="family-name" required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bmdcNumber">BMDC registration number</Label>
        <Input id="bmdcNumber" name="bmdcNumber" inputMode="numeric" required />
        <p className="text-xs text-muted-foreground">4–7 digits. Used to verify you against the BMDC registry.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
        <p className="text-xs text-muted-foreground">At least 10 characters, with letters and numbers.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </div>
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="agreeTerms" required className="mt-1 size-4" />
        <span>
          I confirm I am a registered medical professional and agree to the{" "}
          <a href="/terms" className="underline">terms</a> and{" "}
          <a href="/privacy" className="underline">privacy policy</a>.
        </span>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
          {success}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending || Boolean(success)}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
