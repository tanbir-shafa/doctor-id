"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  adminUpdateVerificationAction,
  adminUploadIdentityDocAction,
} from "@/server/actions/admin-doctor";
import { computeVerificationLevel } from "@/lib/utils/verification";
import type { VerificationLevel, IdDocumentType } from "@/types/doctor";

const LEVEL_LABEL: Record<VerificationLevel, string> = {
  fully_verified: "Verified — blue tick",
  bmdc_verified: "BMDC verified",
  identity_verified: "Identity verified",
  unverified: "Unverified",
};

const ID_TYPES: { value: IdDocumentType; label: string }[] = [
  { value: "nid", label: "National ID (NID)" },
  { value: "passport", label: "Passport" },
  { value: "driving_license", label: "Driving License" },
];

/**
 * Admin-only verification override (no request/queue). Sets the BMDC number +
 * both verification axes directly. The blue "Verified" tick needs BOTH boxes.
 * Granting identity REQUIRES a Gov photo ID (NID) on file — uploaded here or
 * stored from a prior verification — and binds the current profile name
 * (editing the name later revokes it).
 */
export function AdminVerificationSection({
  doctorId,
  initial,
}: {
  doctorId: string;
  initial: {
    bmdcNumber: string;
    bmdcVerified: boolean;
    nidVerified: boolean;
    displayName: string;
    first: string;
    last: string;
    idDocumentType: IdDocumentType | null;
    identityDocumentUrl: string | null;
  };
}) {
  const [bmdc, setBmdc] = useState(initial.bmdcNumber);
  const [bmdcVerified, setBmdcVerified] = useState(initial.bmdcVerified);
  const [nidVerified, setNidVerified] = useState(initial.nidVerified);
  const [idType, setIdType] = useState<IdDocumentType>(initial.idDocumentType ?? "nid");
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const level = computeVerificationLevel(bmdcVerified, nidVerified);
  const hasIdDocOnFile = Boolean(initial.identityDocumentUrl) || Boolean(uploadedFileId);

  async function handleIdFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setSaved(false);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const r = await adminUploadIdentityDocAction(doctorId, fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setUploadedFileId(r.data?.fileId ?? null);
      setUploadedName(file.name);
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    setError(null);
    setSaved(false);
    // Mirror the server guard: granting identity needs a Gov ID on file.
    if (nidVerified && !initial.nidVerified && !hasIdDocOnFile) {
      setError("Upload the doctor's NID / Gov photo ID to grant account verification.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("bmdcNumber", bmdc);
      if (bmdcVerified) fd.set("bmdcVerified", "on");
      if (nidVerified) fd.set("nidVerified", "on");
      fd.set("idDocumentType", idType);
      if (uploadedFileId) fd.set("documentFileId", uploadedFileId);
      const r = await adminUpdateVerificationAction(doctorId, fd);
      if (!r.ok) setError(r.error);
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="bmdcNumber">BMDC registration number</Label>
        <Input
          id="bmdcNumber"
          value={bmdc}
          onChange={(e) => {
            setBmdc(e.target.value);
            setSaved(false);
          }}
          placeholder="e.g. 12345"
          className="max-w-xs"
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={bmdcVerified}
          onChange={(e) => {
            setBmdcVerified(e.target.checked);
            setSaved(false);
          }}
          className="mt-0.5 size-4"
        />
        <span>
          <span className="font-medium">BMDC verified</span>
          <span className="block text-xs text-muted-foreground">
            Confirms the registration against the BMDC registry. Requires a BMDC number above.
          </span>
        </span>
      </label>

      <div className="rounded-md border border-border p-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={nidVerified}
            onChange={(e) => {
              setNidVerified(e.target.checked);
              setSaved(false);
            }}
            className="mt-0.5 size-4"
          />
          <span>
            <span className="font-medium">Account / identity verified</span>
            <span className="block text-xs text-muted-foreground">
              Requires a government photo ID on file. Binds the legal name{" "}
              <strong>{initial.first} {initial.last}</strong> and locks the public display
              name to &ldquo;prefix + first + last&rdquo; — editing the name later removes this.
            </span>
          </span>
        </label>

        <div className="mt-3 space-y-3 pl-6">
          <div className="space-y-1.5">
            <Label htmlFor="idType">Document type</Label>
            <select
              id="idType"
              value={idType}
              onChange={(e) => {
                setIdType(e.target.value as IdDocumentType);
                setSaved(false);
              }}
              className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              onChange={handleIdFile}
              disabled={uploading}
              className="max-w-sm"
            />
            {uploading ? (
              <p className="text-xs text-muted-foreground">Uploading…</p>
            ) : uploadedFileId ? (
              <p className="text-xs text-green-600">Uploaded {uploadedName}. Save to attach.</p>
            ) : initial.identityDocumentUrl ? (
              <p className="text-xs text-muted-foreground">
                ID on file —{" "}
                <a
                  href={initial.identityDocumentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  view
                </a>
                . Upload a new file to replace it.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No ID on file yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
        Resulting badge: <strong>{LEVEL_LABEL[level]}</strong>
        {level !== "fully_verified" ? (
          <span className="block text-xs text-muted-foreground">
            The blue &ldquo;Verified&rdquo; tick needs both BMDC and identity.
          </span>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-600">Saved.</p> : null}

      <Button type="button" onClick={submit} disabled={pending || uploading}>
        {pending ? "Saving…" : "Save verification"}
      </Button>
    </div>
  );
}
