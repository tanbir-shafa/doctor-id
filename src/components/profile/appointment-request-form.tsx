"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarPlus, CheckCircle2, MapPin, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAppointmentRequestAction } from "@/server/actions/appointment";

type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

interface ChamberScheduleSlot {
  day: DayKey;
  startTime: string;
  endTime: string;
  available: boolean;
}

interface ChamberOption {
  _id: string;
  name: string;
  area?: string;
  district?: string;
  schedule?: ChamberScheduleSlot[];
}

const DAY_KEYS: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const MAX_DAYS = 30;

/**
 * Bucket a HH:mm start time into the time-window enum the server still expects.
 * The UI no longer asks the patient to pick a window — we derive it from the
 * chamber's actual hours so the doctor's inbox keeps grouping requests.
 */
function bucketTimeWindow(hhmm: string): "morning" | "afternoon" | "evening" {
  const hour = Number(hhmm.slice(0, 2));
  if (Number.isNaN(hour)) return "morning";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** "08:30" → "8:30 AM" for the read-only schedule display. */
function fmt12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Patient-facing request form. Renders on the public profile sidebar for
 * claimed doctors with at least one chamber. Carries:
 *
 *   - Patient name
 *   - Phone (will be normalized + rate-limited server-side)
 *   - Chamber select (snapshotted at submit so the inbox keeps the name
 *     even if the doctor later renames the chamber)
 *   - Preferred date (HTML5 date input — today through today + 30 days)
 *   - Preferred time window (morning/afternoon/evening chips)
 *   - Reason textarea (300-char cap, server-side sanitized)
 *   - Honeypot text input named `website` — bots fill it, humans don't
 */
export function AppointmentRequestForm({
  slug,
  chambers,
}: {
  slug: string;
  chambers: ChamberOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [chamberId, setChamberId] = useState(chambers[0]?._id ?? "");

  // Date range — today through today + 30 days. <input type="date"> uses ISO
  // strings; we pre-format here to match.
  const today = new Date();
  const todayStr = formatIsoDate(today);
  const maxDate = new Date(today.getTime() + MAX_DAYS * 24 * 60 * 60 * 1000);
  const maxDateStr = formatIsoDate(maxDate);

  const [preferredDate, setPreferredDate] = useState(todayStr);

  // Resolve the chamber's available time slots for the picked date so we can
  // show them read-only. Patient no longer chooses a window — the doctor's
  // chamber hours speak for themselves.
  const slotsForDay = useMemo(() => {
    const chamber = chambers.find((c) => c._id === chamberId);
    if (!chamber?.schedule) return [];
    // Use local-date semantics matching the <input type="date"> output.
    const d = new Date(`${preferredDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return [];
    const dayKey = DAY_KEYS[d.getDay()]!;
    return chamber.schedule
      .filter((s) => s.day === dayKey && s.available !== false)
      .slice()
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [chambers, chamberId, preferredDate]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // Derive the time-window enum from the chamber's first slot of the day so
    // the doctor's inbox keeps grouping requests by morning/afternoon/evening.
    const derivedWindow = slotsForDay[0]
      ? bucketTimeWindow(slotsForDay[0].startTime)
      : "morning";
    const payload = {
      slug,
      chamberId,
      patientName: String(form.get("patientName") ?? ""),
      patientPhone: String(form.get("patientPhone") ?? ""),
      preferredDate: String(form.get("preferredDate") ?? ""),
      preferredTimeWindow: derivedWindow,
      reason: String(form.get("reason") ?? ""),
      website: String(form.get("website") ?? ""),
    };
    setError(null);
    startTransition(async () => {
      const result = await createAppointmentRequestAction(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Request sent
        </div>
        <p>The doctor will get in touch on WhatsApp. No login needed.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      {/* Honeypot — hidden from humans, blank to pass server validation. */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="appt-name">Your name</Label>
        <Input id="appt-name" name="patientName" required maxLength={80} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="appt-phone">Phone</Label>
        <Input
          id="appt-phone"
          name="patientPhone"
          type="tel"
          inputMode="tel"
          placeholder="01712345678"
          required
        />
        <p className="text-xs text-muted-foreground">
          The doctor will reach you on this number — usually via WhatsApp.
        </p>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">
          {chambers.length === 1 ? "Chamber" : "Choose a chamber"}
        </legend>
        <div
          role="radiogroup"
          aria-label="Chamber"
          className="grid gap-2"
        >
          {chambers.map((c) => {
            const selected = chamberId === c._id;
            const locationLine = [c.area, c.district].filter(Boolean).join(", ");
            return (
              <label
                key={c._id}
                className={`group relative flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors ${
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-input bg-background hover:border-primary/40 hover:bg-accent/40"
                }`}
              >
                <input
                  type="radio"
                  name="chamberId"
                  value={c._id}
                  checked={selected}
                  onChange={() => setChamberId(c._id)}
                  className="sr-only"
                  required
                />
                <span
                  className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border ${
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"
                  }`}
                  aria-hidden="true"
                >
                  {selected ? <Check className="size-3" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{c.name}</span>
                  {locationLine ? (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{locationLine}</span>
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="appt-date">Preferred date</Label>
        <Input
          id="appt-date"
          name="preferredDate"
          type="date"
          min={todayStr}
          max={maxDateStr}
          value={preferredDate}
          onChange={(e) => setPreferredDate(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium">Chamber hours that day</span>
        {slotsForDay.length === 0 ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            The doctor isn&apos;t scheduled at this chamber on the selected day. Submit anyway and
            the doctor will follow up to suggest an alternative, or pick a different date.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {slotsForDay.map((s, i) => (
              <li
                key={`${s.day}-${s.startTime}-${i}`}
                className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm tabular-nums"
              >
                <Clock className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="font-medium text-foreground">
                  {fmt12h(s.startTime)} – {fmt12h(s.endTime)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="appt-reason">Reason (optional)</Label>
        <textarea
          id="appt-reason"
          name="reason"
          maxLength={300}
          rows={3}
          placeholder="A short description helps the doctor prepare."
          className="w-full rounded-md border border-input bg-background p-2 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Not medical advice. The doctor will follow up to schedule a real consultation.
        </p>
      </div>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        <CalendarPlus className="size-4" aria-hidden="true" />
        {pending ? "Sending…" : "Request appointment"}
      </Button>
    </form>
  );
}

function formatIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
