"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startRegistrationAction, completeRegistrationAction } from "@/server/actions/auth";
import { SelfieCapture, type SelfieData } from "./selfie-capture";

type Step = "details" | "verify" | "pending";

interface RegisterFormProps {
  claimSlug?: string | null;
  initialStep?: Step | string;
  initialPhone?: string;
}

export function RegisterForm({
  claimSlug = null,
  initialStep = "details",
  initialPhone = "",
}: RegisterFormProps) {
  const [step, setStep] = useState<Step>(initialStep === "verify" ? "verify" : "details");
  const [phone, setPhone] = useState(initialPhone);
  const [otp, setOtp] = useState("");
  const [selfie, setSelfie] = useState<SelfieData | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function submitDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selfie) {
      setError("Capture your live selfie to continue.");
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

    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await startRegistrationAction(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
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
      setStep("pending");
    });
  }

  if (step === "pending") {
    return (
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-semibold">Your account is created — pending admin approval.</p>
            <p>
              We&apos;ll review your registration within 24 hours. You can&apos;t sign in just
              yet; once we approve, you&apos;ll get a text and can log in by phone.
            </p>
          </div>
        </div>
        <p className="text-center text-muted-foreground">
          <Link href="/" className="text-primary hover:underline">
            Back to homepage
          </Link>
        </p>
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

      {/* Mandatory live selfie */}
      <div className="space-y-1.5">
        <Label>Live selfie (required)</Label>
        <p className="text-xs text-muted-foreground">
          We&apos;ll open your camera for a quick identity selfie — used for verification only.
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

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="agreeTerms" required className="mt-1 size-4" />
        <span>
          I confirm I am a registered medical professional and agree to the{" "}
          <Link href="/terms" className="underline">terms</Link> and{" "}
          <Link href="/privacy" className="underline">privacy policy</Link>.
        </span>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending || !selfie}>
        {pending ? "Sending code…" : claimSlug ? "Claim profile" : "Create account"}
      </Button>
    </form>
  );
}
