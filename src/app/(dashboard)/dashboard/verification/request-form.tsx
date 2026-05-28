"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { presignProfileUpload } from "@/server/actions/photo";
import { requestVerificationAction } from "@/server/actions/verification";

export function VerificationRequestForm({ initialBmdc }: { initialBmdc: string }) {
  const [uploadedKey, setUploadedKey] = useState<string | null>(null);
  const [bmdc, setBmdc] = useState(initialBmdc);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    const presigned = await presignProfileUpload({
      kind: "verification",
      contentType: file.type,
      contentLength: file.size,
    });
    if (!presigned.ok || !presigned.data) {
      setError(!presigned.ok ? presigned.error : "Could not prepare upload");
      return;
    }
    const put = await fetch(presigned.data.uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!put.ok) {
      setError(`Upload failed (HTTP ${put.status})`);
      return;
    }
    setUploadedKey(presigned.data.key);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("bmdcNumber", bmdc);
      fd.set("notes", notes);
      if (uploadedKey) fd.append("documentKey", uploadedKey);
      const r = await requestVerificationAction(fd);
      if (!r.ok) setError(r.error);
      else setDone(true);
    });
  }

  if (done) {
    return (
      <p className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
        Request submitted. We&apos;ll email you when it&apos;s reviewed.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="bmdcNumber">BMDC registration number</Label>
        <Input id="bmdcNumber" value={bmdc} onChange={(e) => setBmdc(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="docFile">BMDC certificate (JPG/PNG/WebP/PDF)</Label>
        <Input id="docFile" type="file" accept="image/*,application/pdf" onChange={handleFile} />
        {uploadedKey ? (
          <p className="text-xs text-green-600">Uploaded. Submit to send for review.</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes for reviewers (optional)</Label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={1000}
          className="w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Submitting…" : "Submit for review"}
      </Button>
    </div>
  );
}
