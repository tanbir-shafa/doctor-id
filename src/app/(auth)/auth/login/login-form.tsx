"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestLoginOtpAction } from "@/server/actions/auth";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import { trackEvent } from "@/lib/analytics/gtag";

type Step = "phone" | "otp";

/**
 * Doctor login — phone + SMS OTP only.
 *
 * Step 1: enter phone → `requestLoginOtpAction` (returns a clear error if no
 *   account exists for the number, so the user knows to register).
 * Step 2: enter the 6-digit OTP → `signIn("sms-otp")` mints the session.
 *
 * Admins use `/auth/email/login` instead.
 */
export function DoctorLoginForm({ defaultPhone = "", next }: { defaultPhone?: string; next?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState(defaultPhone);
  const [otp, setOtp] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [tsReset, setTsReset] = useState(0);

  function submitPhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await requestLoginOtpAction({ phone, turnstileToken });
      // Re-arm the single-use challenge for any subsequent attempt.
      setTsReset((n) => n + 1);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      trackEvent("otp_requested", { flow: "login" });
      setInfo("We sent a 6-digit code to your phone. It expires in 10 minutes.");
      setStep("otp");
    });
  }

  function submitOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await signIn("sms-otp", { phone, otp, redirect: false });
      if (!r || r.error) {
        setError("That code is incorrect or expired. Try again or request a new code.");
        return;
      }
      trackEvent("login", { method: "phone_otp" });
      router.push(next ?? "/dashboard");
      router.refresh();
    });
  }

  if (step === "otp") {
    return (
      <form onSubmit={submitOtp} className="space-y-3" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="otp">6-digit code</Label>
          <Input
            id="otp"
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            required
            autoFocus
          />
          <p className="text-xs text-muted-foreground">Sent to {phone}.</p>
        </div>
        {info ? (
          <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
            {info}
          </p>
        ) : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={pending || otp.length !== 6}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <button
          type="button"
          className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            setStep("phone");
            setOtp("");
            setError(null);
            setInfo(null);
          }}
        >
          Use a different phone number
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitPhone} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="phone">Phone number</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="01712345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
      </div>
      <TurnstileWidget onToken={setTurnstileToken} resetSignal={tsReset} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending code…" : "Send sign-in code"}
      </Button>
    </form>
  );
}
