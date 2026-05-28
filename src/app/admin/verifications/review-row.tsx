"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { approveClaimAction, rejectClaimAction } from "@/server/actions/verification";

interface Props {
  claim: {
    _id: string;
    bmdcNumberProvided: string;
    documentsUploaded: string[];
    notesFromDoctor: string | null;
    createdAt: string;
    doctorId: {
      _id: string;
      slug: string;
      name: { displayName: string; prefix: string };
      bmdcNumber: string | null;
    };
  };
}

export function ReviewRow({ claim }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const r = await approveClaimAction(claim._id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }
  function reject() {
    if (!rejectNotes.trim()) {
      setError("Add a brief note so the doctor knows why.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await rejectClaimAction(claim._id, rejectNotes.trim());
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>
              {claim.doctorId.name.prefix} {claim.doctorId.name.displayName}
            </CardTitle>
            <CardDescription>
              BMDC #{claim.bmdcNumberProvided}
              {" · "}submitted {new Date(claim.createdAt).toLocaleDateString()}
            </CardDescription>
          </div>
          <Link
            href={`/${claim.doctorId.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            View profile <ExternalLink className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {claim.notesFromDoctor ? (
          <p className="rounded-md border border-border bg-muted/40 p-2 text-muted-foreground">
            {claim.notesFromDoctor}
          </p>
        ) : null}
        {claim.documentsUploaded.length > 0 ? (
          <ul className="space-y-1">
            {claim.documentsUploaded.map((k) => (
              <li key={k} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <FileText className="size-3.5" aria-hidden="true" />
                <a
                  href={`https://${process.env.S3_BUCKET ?? "doctor-id-uploads"}.s3.amazonaws.com/${k}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {k}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No documents uploaded.</p>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {showRejectBox ? (
          <div className="space-y-2">
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={2}
              placeholder="Reason — visible to the doctor"
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" type="button" onClick={() => setShowRejectBox(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" type="button" onClick={reject} disabled={pending}>
                <XCircle className="size-4" aria-hidden="true" /> Confirm reject
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={approve} disabled={pending}>
              <CheckCircle2 className="size-4" aria-hidden="true" /> Approve
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowRejectBox(true)} disabled={pending}>
              <XCircle className="size-4" aria-hidden="true" /> Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
