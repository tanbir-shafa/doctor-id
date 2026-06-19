"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startRegistrationAction, completeRegistrationAction } from "@/server/actions/auth";
import { SelfieCapture, type SelfieData } from "./selfie-capture";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import { trackEvent } from "@/lib/analytics/gtag";

type Step = "details" | "verify" | "pending";

interface RegisterFormProps {
  claimSlug?: string | null;
  initialStep?: Step | string;
  initialPhone?: string;
  initialReferralCode?: string;
  referrerName?: string | null;
}

export function RegisterForm({
  claimSlug = null,
  initialStep = "details",
  initialPhone = "",
  initialReferralCode = "",
  referrerName = null,
}: RegisterFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep === "verify" ? "verify" : "details");
  const [phone, setPhone] = useState(initialPhone);
  const [otp, setOtp] = useState("");
  const [referralCode, setReferralCode] = useState(initialReferralCode);
  const [selfie, setSelfie] = useState<SelfieData | null>(null);
  const [bioConsent, setBioConsent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tsReset, setTsReset] = useState(0);

  function submitDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selfie) {
      setError("Capture your live selfie to continue.");
      return;
    }
    if (!bioConsent) {
      setError("Please tick the consent to process your selfie to continue.");
      return;
    }
    const form = new FormData(event.currentTarget);
    // Carry the already-uploaded selfie key + content metadata so the server
    // can mint the File doc at materialization without re-reading S3.
    form.set("selfieS3Key", selfie.key);
    form.set("selfieSha256", selfie.sha256);
    form.set("selfieSize", String(selfie.sizeBytes));
    form.set("selfieMime", selfie.mimeType);
    if (claimSlug) form.set("claimSlug", claimSlug);
    // Founding Doctor referral: carry the code + how it arrived. "link" when the
    // code is the untouched value pre-filled from `?ref=`, else "manual".
    const trimmedReferral = referralCode.trim();
    form.set("referralCode", trimmedReferral);
    form.set(
      "referralSource",
      initialReferralCode && trimmedReferral === initialReferralCode.trim() ? "link" : "manual",
    );

    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await startRegistrationAction(form);
      setTsReset((n) => n + 1);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      trackEvent("otp_requested", { flow: claimSlug ? "claim" : "register" });
      setInfo("We sent a 6-digit verification code to your phone. It expires in 10 minutes.");
      setStep("verify");
    });
  }

  function submitOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await completeRegistrationAction({ phone, otp });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      trackEvent("sign_up", { method: "phone_otp", flow: claimSlug ? "claim" : "register" });
      // Auto sign-in with the same OTP (left valid by completeRegistrationAction)
      // → straight into the dashboard. No second code to enter.
      const signedIn = await signIn("sms-otp", { phone, otp, redirect: false });
      if (!signedIn || signedIn.error) {
        // Materialized but couldn't auto-sign-in — fall back to the login page.
        setStep("pending");
        return;
      }
      router.push("/dashboard?welcome=1");
      router.refresh();
    });
  }

  if (step === "pending") {
    return (
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">Your account is created.</p>
            <p>
              Sign in with your phone to set up your profile. You can edit and preview it
              right away — publishing unlocks once an admin approves (usually within 24 hours).
            </p>
          </div>
        </div>
        <Link
          href="/auth/login"
          className="block w-full rounded-md bg-primary px-4 py-2 text-center font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  if (step === "verify") {
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
          <p className="text-xs text-muted-foreground">Sent to {phone || "your phone"}.</p>
        </div>
        {info ? (
          <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
            {info}
          </p>
        ) : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={pending || otp.length !== 6}>
          {pending ? "Verifying…" : "Verify & continue"}
        </Button>
        <button
          type="button"
          className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            setStep("details");
            setOtp("");
            setError(null);
            setInfo(null);
          }}
        >
          Back to details
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitDetails} className="space-y-4" noValidate>
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
        <Label htmlFor="bmdcNumber">BMDC registration number</Label>
        <Input id="bmdcNumber" name="bmdcNumber" inputMode="numeric" required />
        <p className="text-xs text-muted-foreground">
          4–7 digits. Find yours at{" "}
          <a
            href="https://www.bmdc.org.bd"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            bmdc.org.bd
          </a>
          .
        </p>
      </div>
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
        <p className="text-xs text-muted-foreground">
          We&apos;ll send a 6-digit code. This number becomes your sign-in.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email (optional)</Label>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" />
        <p className="text-xs text-muted-foreground">For notifications. Add later if you prefer.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="referralCode">Referral code (optional)</Label>
        <Input
          id="referralCode"
          name="referralCode"
          value={referralCode}
          onChange={(e) => setReferralCode(e.target.value)}
          placeholder="A colleague's BMDC number"
        />
        {referrerName ? (
          <p className="text-xs text-emerald-700">Referred by {referrerName}.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Were you referred? Enter your colleague&apos;s BMDC number (or referral code) to credit
            them.
          </p>
        )}
      </div>

      {/* Mandatory live selfie */}
      <div className="space-y-1.5">
        <Label>Live selfie (required)</Label>
        <p className="text-xs text-muted-foreground">
          We&apos;ll open your camera for a quick identity selfie — used for verification only.
          By capturing it you consent to the biometric processing described below.
        </p>
        <SelfieCapture
          onCaptured={(data) => {
            setSelfie(data);
            setError(null);
          }}
          onCleared={() => setSelfie(null)}
          disabled={pending}
        />
      </div>

      {/* PDPO 2025: explicit, specific consent for biometric (sensitive) data,
          kept separate from the general terms agreement. Server re-validates
          `agreeBiometric` in startRegistrationAction. */}
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          name="agreeBiometric"
          required
          checked={bioConsent}
          onChange={(e) => setBioConsent(e.target.checked)}
          className="mt-1 size-4 shrink-0"
        />
        <span>
          I consent to Daktar.Link processing my live selfie as biometric data to verify my
          identity and prevent fraud. It is kept private, never shown publicly, and I can
          withdraw consent at any time — see the{" "}
          <Link href="/privacy" className="underline">privacy policy</Link>.
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="agreeTerms" required className="mt-1 size-4 shrink-0" />
        <span>
          I confirm I am a registered medical professional and agree to the{" "}
          <Link href="/terms" className="underline">terms</Link> and{" "}
          <Link href="/privacy" className="underline">privacy policy</Link>.
        </span>
      </label>
      <TurnstileWidget resetSignal={tsReset} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending || !selfie || !bioConsent}>
        {pending ? "Sending code…" : claimSlug ? "Claim profile" : "Create account"}
      </Button>
    </form>
  );
}
