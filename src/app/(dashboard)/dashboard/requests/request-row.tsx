"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, MessageCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateAppointmentRequestStatusAction } from "@/server/actions/appointment";

interface Props {
  request: {
    _id: string;
    status: "pending" | "seen" | "booked" | "rejected";
    patientName: string;
    patientPhone: string;
    chamberName: string | null;
    preferredDate: string;
    preferredTimeWindow: "morning" | "afternoon" | "evening";
    reason: string | null;
    createdAt: string;
  };
  doctorName: string;
}

const TIME_LABEL: Record<Props["request"]["preferredTimeWindow"], string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

const STATUS_TONE: Record<Props["request"]["status"], string> = {
  pending: "bg-amber-100 text-amber-900",
  seen: "bg-sky-100 text-sky-900",
  booked: "bg-emerald-100 text-emerald-900",
  rejected: "bg-slate-100 text-slate-700",
};

/**
 * One row of the doctor's appointment inbox. Actions are status mutations
 * plus a "WhatsApp reply" deep-link that prefills a message — patients can
 * reply directly without the doctor remembering to type the appointment
 * details. The doctor's own profile name is included in the message so the
 * patient knows who's reaching out.
 */
export function RequestRow({ request, doctorName }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(request.status);

  function setStatusTo(next: Props["request"]["status"]) {
    setError(null);
    startTransition(async () => {
      const r = await updateAppointmentRequestStatusAction({
        requestId: request._id,
        status: next,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setStatus(next);
    });
  }

  const phoneNoPlus = request.patientPhone.replace(/^\+/, "");
  const waMessage = encodeURIComponent(
    `Hello ${request.patientName.split(" ")[0] ?? ""}, this is ${doctorName} from Daktar.Link. Following up on your appointment request for ${new Date(request.preferredDate).toLocaleDateString()} (${TIME_LABEL[request.preferredTimeWindow]}).`,
  );
  const waHref = `https://wa.me/${phoneNoPlus}?text=${waMessage}`;

  return (
    <li className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{request.patientName}</p>
          <p className="text-xs text-muted-foreground">
            <a href={`tel:${request.patientPhone}`} className="hover:underline">
              {request.patientPhone}
            </a>
            {request.chamberName ? ` · ${request.chamberName}` : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Preferred: {new Date(request.preferredDate).toLocaleDateString()} ·{" "}
            {TIME_LABEL[request.preferredTimeWindow]} · submitted{" "}
            {new Date(request.createdAt).toLocaleString()}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[status]}`}
        >
          {status}
        </span>
      </div>

      {request.reason ? (
        <div className="border-b border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {request.reason}
        </div>
      ) : null}

      {error ? (
        <p className="border-b border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 p-3">
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          WhatsApp reply
        </a>
        {status === "pending" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setStatusTo("seen")}
          >
            <Eye className="size-4" aria-hidden="true" /> Mark seen
          </Button>
        ) : null}
        {status !== "booked" ? (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => setStatusTo("booked")}
          >
            <CheckCircle2 className="size-4" aria-hidden="true" /> Mark booked
          </Button>
        ) : null}
        {status !== "rejected" ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setStatusTo("rejected")}
          >
            <XCircle className="size-4 text-destructive" aria-hidden="true" /> Reject
          </Button>
        ) : null}
      </div>
    </li>
  );
}
