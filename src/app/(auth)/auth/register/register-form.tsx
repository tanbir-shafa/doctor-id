"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, FileText, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startRegistrationAction, completeRegistrationAction } from "@/server/actions/auth";
import { presignRegistrationDocAction } from "@/server/actions/photo";

const ALLOWED_DOC_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_DOC_BYTES = 5 * 1024 * 1024;
const MAX_DOCS = 5;

type Step = "details" | "verify" | "pending";

interface UploadedDoc {
  label: string;
  fileName: string;
  s3Key: string;
}

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
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [docsOpen, setDocsOpen] = useState(true);
  const [docUploading, setDocUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleDocUpload(file: File, label: string) {
    setError(null);
    if (!ALLOWED_DOC_TYPES.includes(file.type)) {
      setError("Pick a JPG, PNG, WebP, or PDF file.");
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      setError("File is larger than 5 MB.");
      return;
    }
    if (docs.length >= MAX_DOCS) {
      setError(`You can attach up to ${MAX_DOCS} documents.`);
      return;
    }
    setDocUploading(true);
    try {
      const presigned = await presignRegistrationDocAction({
        contentType: file.type,
        contentLength: file.size,
      });
      if (!presigned.ok) {
        setError(presigned.error);
        return;
      }
      const put = await fetch(presigned.data!.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) {
        setError(`Upload failed (HTTP ${put.status}). Try again.`);
        return;
      }
      setDocs((d) => [...d, { label, fileName: file.name, s3Key: presigned.data!.key }]);
    } finally {
      setDocUploading(false);
    }
  }

  function removeDoc(idx: number) {
    setDocs((d) => d.filter((_, i) => i !== idx));
  }

  function submitDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // The file inputs are uncontrolled — clear them out of the FormData and
    // pass only the s3Keys that came back from the presigned uploads.
    form.delete("nid");
    form.delete("selfie");
    form.delete("other");
    for (const d of docs) form.append("documentS3Keys", d.s3Key);
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

      {/* Collapsible: speed up verification */}
      <div className="rounded-md border border-primary/30 bg-primary/5">
        <button
          type="button"
          onClick={() => setDocsOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
          aria-expanded={docsOpen}
        >
          <span>
            Speed up verification (recommended)
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              · NID + selfie cuts review to under 24h
            </span>
          </span>
          {docsOpen ? (
            <ChevronUp className="size-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4" aria-hidden="true" />
          )}
        </button>
        {docsOpen ? (
          <div className="space-y-3 px-3 pb-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Without these, manual review takes 3–5 business days. All optional.
            </p>
            <DocPicker
              label="NID front/back"
              onPick={(f) => handleDocUpload(f, "NID")}
              disabled={docUploading || docs.length >= MAX_DOCS}
            />
            <DocPicker
              label="Selfie holding your NID"
              onPick={(f) => handleDocUpload(f, "Selfie")}
              disabled={docUploading || docs.length >= MAX_DOCS}
            />
            <DocPicker
              label="Other supporting documents (BMDC certificate, hospital ID, etc.)"
              onPick={(f) => handleDocUpload(f, "Other")}
              disabled={docUploading || docs.length >= MAX_DOCS}
            />
            {docs.length > 0 ? (
              <ul className="space-y-1">
                {docs.map((d, i) => (
                  <li
                    key={`${d.s3Key}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <span className="inline-flex items-center gap-1 truncate">
                      <FileText className="size-3.5" aria-hidden="true" />
                      <span className="truncate">
                        <strong>{d.label}:</strong> {d.fileName}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeDoc(i)}
                      aria-label={`Remove ${d.fileName}`}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
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
      <Button type="submit" className="w-full" disabled={pending || docUploading}>
        {pending ? "Sending code…" : claimSlug ? "Claim profile" : "Create account"}
      </Button>
    </form>
  );
}

function DocPicker({
  label,
  onPick,
  disabled,
}: {
  label: string;
  onPick: (file: File) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border border-dashed border-input bg-background px-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <input
        type="file"
        accept={ALLOWED_DOC_TYPES.join(",")}
        className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-primary-foreground hover:file:bg-primary/90"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            onPick(f);
            // Reset so the same filename can be re-picked.
            e.target.value = "";
          }
        }}
      />
    </label>
  );
}
