"use client";

import { useState, useTransition } from "react";
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
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

      <div className="space-y-1.5">
        <Label htmlFor="idFile">Government photo ID (JPG/PNG/WebP/PDF)</Label>
        <Input
          id="idFile"
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFile}
          disabled={uploading}
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
      <Button type="button" onClick={submit} disabled={pending || uploading}>
        {pending ? "Submitting…" : "Submit for review"}
      </Button>
    </div>
  );
}
