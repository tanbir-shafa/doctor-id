"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadIdentityDocAction } from "@/server/actions/photo";
import { requestAccountVerificationAction } from "@/server/actions/verification";

const ID_TYPES = [
  { value: "nid", label: "National ID (NID)" },
  { value: "passport", label: "Passport" },
  { value: "driving_license", label: "Driving License" },
] as const;

export function AccountVerificationForm({
  initialFirst,
  initialLast,
}: {
  initialFirst: string;
  initialLast: string;
}) {
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  const [idType, setIdType] = useState<string>("nid");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!consent) {
      setError("Please give consent below before uploading your ID.");
      event.target.value = "";
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await uploadIdentityDocAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setUploadedFileId(r.data?.fileId ?? null);
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    setError(null);
    if (!consent) {
      setError("Please consent to processing your ID for identity verification.");
      return;
    }
    if (!uploadedFileId) {
      setError("Upload a photo of your Government ID first.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("legalFirstName", first);
      fd.set("legalLastName", last);
      fd.set("idDocumentType", idType);
      fd.set("notes", notes);
      fd.set("consent", "true");
      fd.append("documentFileId", uploadedFileId);
      const r = await requestAccountVerificationAction(fd);
      if (!r.ok) setError(r.error);
      else setDone(true);
    });
  }

  if (done) {
    return (
      <p className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
        Request submitted. We&apos;ll review your ID within 24 hours.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="legalFirstName">Legal first name (as on ID)</Label>
          <Input
            id="legalFirstName"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="legalLastName">Legal last name (as on ID)</Label>
          <Input id="legalLastName" value={last} onChange={(e) => setLast(e.target.value)} required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="idType">Document type</Label>
        <select
          id="idType"
          value={idType}
          onChange={(e) => setIdType(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {ID_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* PDPO 2025: explicit, specific consent for sensitive personal data,
          captured BEFORE the document uploads (it uploads on file-select). */}
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-4 shrink-0"
        />
        <span>
          I consent to Daktar.Link processing my government ID and legal name as sensitive
          personal data to verify my identity. The document is stored privately, seen only by
          authorised reviewers, and I can withdraw consent at any time — see the{" "}
          <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </span>
      </label>

      <div className="space-y-1.5">
        <Label htmlFor="idFile">Government photo ID (JPG/PNG/WebP/PDF)</Label>
        <Input
          id="idFile"
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFile}
          disabled={uploading || !consent}
        />
        {uploading ? (
          <p className="text-xs text-muted-foreground">Uploading…</p>
        ) : uploadedFileId ? (
          <p className="text-xs text-green-600">Uploaded. Submit to send for review.</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="accountNotes">Notes for reviewers (optional)</Label>
        <textarea
          id="accountNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={1000}
          className="w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
        On approval your public name becomes <strong>title + first + last</strong> (matching
        your ID). Changing your first or last name later will remove this verification.
      </p>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={submit} disabled={pending || uploading || !consent}>
        {pending ? "Submitting…" : "Submit for review"}
      </Button>
    </div>
  );
}
