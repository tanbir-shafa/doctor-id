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
  IdCard,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  approveAccountVerificationAction,
  rejectAccountVerificationAction,
} from "@/server/actions/verification";
import { classifySla, type SlaTone } from "@/lib/sla";
import { normalizeLegalName } from "@/lib/utils/verification";
import type { IdDocumentType } from "@/types/doctor";

interface Props {
  request: {
    _id: string;
    status: string;
    legalName: { first: string; last: string };
    idDocumentType: IdDocumentType;
    documents: { name: string; url: string | null; mimeType: string | null }[];
    notesFromDoctor: string | null;
    createdAt: string;
    slaExpiresAt: string | null;
    verifiedAt: string | null;
    doctorId: {
      _id: string;
      slug: string;
      name: { displayName: string; prefix: string; first: string; last: string };
      verificationLevel: string;
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

const ID_TYPE_LABEL: Record<IdDocumentType, string> = {
  nid: "National ID (NID)",
  passport: "Passport",
  driving_license: "Driving License",
};

export function IdentityReviewRow({ request, nowIso }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectNotes, setRejectNotes] = useState("");
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const r = await approveAccountVerificationAction(request._id);
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
      const r = await rejectAccountVerificationAction(request._id, rejectNotes.trim());
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  const sla = classifySla(request, new Date(nowIso));
  const requesterEmail = request.requestedBy?.email ?? "—";
  const isSyntheticEmail = requesterEmail.endsWith("@phone.doctor.id.bd");
  const requesterPhone = request.requestedBy?.phone ?? "—";

  const legalFull = `${request.legalName.first} ${request.legalName.last}`.trim();
  const profileFull = `${request.doctorId.name.first} ${request.doctorId.name.last}`.trim();
  const nameMatches =
    normalizeLegalName(request.legalName.first, request.legalName.last) ===
    normalizeLegalName(request.doctorId.name.first, request.doctorId.name.last);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2">
              <span>{request.doctorId.name.displayName}</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[sla.tone]}`}
                title="24-hour verification SLA"
              >
                <Clock className="size-3.5" aria-hidden="true" />
                {sla.label}
              </span>
              <span
                className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700"
                title="Account / identity verification"
              >
                <Tag className="size-3" aria-hidden="true" />
                Identity
              </span>
            </CardTitle>
            <CardDescription>
              Submitted {new Date(request.createdAt).toLocaleString()}
              {" · "}slug{" "}
              <Link
                href={`/${request.doctorId.slug}`}
                target="_blank"
                className="text-primary hover:underline"
              >
                /{request.doctorId.slug}
              </Link>
            </CardDescription>
          </div>
          <Link
            href={`/${request.doctorId.slug}`}
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
              {request.requestedBy?.phoneVerified ? (
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
              role: {request.requestedBy?.role ?? "—"}
            </li>
          </ul>
        </div>

        {/* Legal name vs profile name */}
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
          <p className="mb-1 inline-flex items-center gap-1 font-medium text-foreground">
            <IdCard className="size-3.5" aria-hidden="true" />
            {ID_TYPE_LABEL[request.idDocumentType]}
          </p>
          <p className="text-muted-foreground">
            Legal name on ID: <strong className="text-foreground">{legalFull}</strong>
          </p>
          <p className="text-muted-foreground">
            Current profile name: <strong className="text-foreground">{profileFull}</strong>
            {nameMatches ? (
              <span className="ml-2 rounded-full bg-emerald-100 px-1.5 text-[10px] text-emerald-900">
                matches
              </span>
            ) : (
              <span className="ml-2 rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-900">
                differs — approving will rename the profile to the ID name
              </span>
            )}
          </p>
        </div>

        {request.notesFromDoctor ? (
          <p className="rounded-md border border-border bg-muted/40 p-2 text-muted-foreground">
            {request.notesFromDoctor}
          </p>
        ) : null}

        {/* Gov ID document(s) — presigned GET URLs (private bucket). */}
        {request.documents.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">
              {request.documents.length} document
              {request.documents.length === 1 ? "" : "s"} attached
            </p>
            <ul className="space-y-1">
              {request.documents.map((doc, i) => (
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
              <Button variant="ghost" size="sm" type="button" onClick={() => setShowRejectBox(false)}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" type="button" onClick={reject} disabled={pending}>
                <XCircle className="size-4" aria-hidden="true" /> Confirm reject
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={approve} disabled={pending}>
              <CheckCircle2 className="size-4" aria-hidden="true" /> Approve &amp; grant verification
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
