"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  ExternalLink,
  FileText,
  Clock,
  Phone,
  Mail,
  Tag,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { approveClaimAction, rejectClaimAction } from "@/server/actions/verification";
import { classifySla, type SlaTone } from "@/lib/sla";

interface Props {
  claim: {
    _id: string;
    status: string;
    bmdcNumberProvided: string | null;
    documents: { name: string; url: string | null; mimeType: string | null }[];
    selfieUrl: string | null;
    notesFromDoctor: string | null;
    createdAt: string;
    slaExpiresAt: string | null;
    verifiedAt: string | null;
    doctorId: {
      _id: string;
      slug: string;
      name: { displayName: string; prefix: string };
      bmdcNumber: string | null;
    };
    requestedBy: {
      _id: string;
      email: string;
      phone: string | null;
      phoneVerified: boolean;
      approved: boolean;
      role: "doctor" | "admin" | "patient";
    } | null;
  };
  nowIso: string;
}

const TONE_CLASSES: Record<SlaTone, string> = {
  red: "bg-red-100 text-red-900 border-red-200",
  amber: "bg-amber-100 text-amber-900 border-amber-200",
  green: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

export function ReviewRow({ claim, nowIso }: Props) {
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

  const sla = classifySla(claim, new Date(nowIso));
  const requesterEmail = claim.requestedBy?.email ?? "—";
  const isSyntheticEmail = requesterEmail.endsWith("@phone.daktar.link");
  const requesterPhone = claim.requestedBy?.phone ?? "—";
  const bmdcChanged =
    claim.bmdcNumberProvided &&
    claim.doctorId.bmdcNumber &&
    claim.bmdcNumberProvided !== claim.doctorId.bmdcNumber;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <span>
                {claim.doctorId.name.displayName}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[sla.tone]}`}
                title="24-hour verification SLA"
              >
                <Clock className="size-3.5" aria-hidden="true" />
                {sla.label}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                title="Claim review"
              >
                <Tag className="size-3" aria-hidden="true" />
                Claim
              </span>
            </CardTitle>
            <CardDescription>
              Submitted {new Date(claim.createdAt).toLocaleString()}
              {" · "}slug{" "}
              <Link
                href={`/${claim.doctorId.slug}`}
                target="_blank"
                className="text-primary hover:underline"
              >
                /{claim.doctorId.slug}
              </Link>
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
        {/* Requester identity panel */}
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
          <p className="mb-1 font-medium text-foreground">Requested by</p>
          <ul className="space-y-1 text-muted-foreground">
            <li className="inline-flex items-center gap-1">
              <Phone className="size-3.5" aria-hidden="true" />
              <a href={`tel:${requesterPhone}`} className="hover:underline">
                {requesterPhone}
              </a>
              {claim.requestedBy?.phoneVerified ? (
                <span className="ml-1 rounded-full bg-emerald-100 px-1.5 text-[10px] text-emerald-900">
                  verified
                </span>
              ) : (
                <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-900">
                  unverified
                </span>
              )}
            </li>
            <li className="inline-flex items-center gap-1">
              <Mail className="size-3.5" aria-hidden="true" />
              {isSyntheticEmail ? (
                <span className="italic">no email on file</span>
              ) : (
                <a href={`mailto:${requesterEmail}`} className="hover:underline">
                  {requesterEmail}
                </a>
              )}
            </li>
            <li className="inline-flex items-center gap-1">
              <UserIcon className="size-3.5" aria-hidden="true" />
              role: {claim.requestedBy?.role ?? "—"}
              {claim.requestedBy?.approved === false ? (
                <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-900">
                  awaiting approval (can&apos;t publish yet)
                </span>
              ) : null}
            </li>
          </ul>
        </div>

        {/* BMDC sub-line */}
        <p className="text-xs text-muted-foreground">
          BMDC provided: <strong>{claim.bmdcNumberProvided ?? "—"}</strong>
          {claim.doctorId.bmdcNumber ? (
            <>
              {" · "}on profile: <strong>{claim.doctorId.bmdcNumber}</strong>
            </>
          ) : null}
          {bmdcChanged ? (
            <span className="ml-2 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-900">
              mismatch
            </span>
          ) : null}
        </p>

        {claim.notesFromDoctor ? (
          <p className="rounded-md border border-border bg-muted/40 p-2 text-muted-foreground">
            {claim.notesFromDoctor}
          </p>
        ) : null}

        {/* Identity selfie — presigned GET (private bucket). */}
        {claim.selfieUrl ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">Identity selfie</p>
            <a href={claim.selfieUrl} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={claim.selfieUrl}
                alt="Registration selfie"
                className="size-28 rounded-md border border-border object-cover"
              />
            </a>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No selfie on file.</p>
        )}

        {/* Document attachments — presigned GET URLs (private bucket). */}
        {claim.documents.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">
              {claim.documents.length} document
              {claim.documents.length === 1 ? "" : "s"} attached
            </p>
            <ul className="space-y-1">
              {claim.documents.map((doc, i) => (
                <li
                  key={`${doc.name}-${i}`}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <FileText className="size-3.5" aria-hidden="true" />
                  {doc.url ? (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {doc.name}
                    </a>
                  ) : (
                    <span>{doc.name}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">No documents uploaded.</p>
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
              <CheckCircle2 className="size-4" aria-hidden="true" /> Approve &amp; allow publishing
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
