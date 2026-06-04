/**
 * Pure data builder for the Rx pad PDF.
 *
 * Lives in its own module so we can unit-test the field selection + schedule
 * formatting without standing up the renderer or hitting Mongo. The route
 * handler composes this DTO from a Mongoose-leaned doctor doc, generates a
 * QR data URL, and hands the merged shape to `<RxPad />`.
 *
 * `buildRxPadDto` returns either the DTO ready to render, or a structured
 * "missing fields" result the dashboard surfaces as an empty state with
 * direct links to fix each gap.
 */

import type { DoctorDocLike } from "@/types/doctor";

export interface RxPadChamber {
  name: string;
  address: string;
  phone: string | null;
  /** Pre-formatted schedule like "Sat–Wed 5:00 PM – 9:00 PM · Fri off". */
  schedule: string;
  consultationFee: string | null;
}

export interface RxPadDto {
  /** "Prof. Dr. M. Nazrul Islam" — already includes the prefix. */
  displayName: string;
  /** Combined degree string, comma-separated. May be empty. */
  degrees: string;
  bmdcNumber: string;
  /** Public S3 (or legacy-external) URL. May be null when the doctor has no photo. */
  photoUrl: string | null;
  primarySpecialty: string | null;
  chambers: RxPadChamber[];
  /** `https://doctor.id.bd/<slug>` — what the QR points to. */
  profileUrl: string;
}

export interface RxPadMissing {
  ok: false;
  /** Stable keys the page maps to "Fix this →" links. */
  missing: Array<"name" | "bmdc" | "chamber" | "photo" | "qualifications">;
}
export type RxPadResult = ({ ok: true } & RxPadDto) | RxPadMissing;

/** Day-of-week display order — Bangladesh week starts Saturday. */
const DAY_ORDER: Array<"sat" | "sun" | "mon" | "tue" | "wed" | "thu" | "fri"> = [
  "sat",
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
];
const DAY_LABEL: Record<(typeof DAY_ORDER)[number], string> = {
  sat: "Sat",
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
};

/**
 * Format the time range list for a chamber.
 *
 * Groups consecutive days that share the same start/end times into ranges:
 *   "Sat–Wed 5:00 PM – 9:00 PM · Fri 10:00 AM – 1:00 PM"
 *
 * When the chamber has no schedule slots, returns "Schedule on profile".
 */
export function formatSchedule(
  slots: Array<{ day: string; startTime: string; endTime: string; available?: boolean }>,
): string {
  if (!slots || slots.length === 0) return "Schedule on profile";

  // Bucket by day (only keep the first slot per day for the pad summary —
  // full schedule lives on the public profile that the QR points to).
  const byDay = new Map<string, { startTime: string; endTime: string }>();
  for (const s of slots) {
    if (s.available === false) continue;
    if (!byDay.has(s.day)) byDay.set(s.day, { startTime: s.startTime, endTime: s.endTime });
  }
  if (byDay.size === 0) return "Schedule on profile";

  // Walk DAY_ORDER, group consecutive days with identical times.
  const groups: Array<{ days: string[]; startTime: string; endTime: string }> = [];
  for (const day of DAY_ORDER) {
    const entry = byDay.get(day);
    if (!entry) continue;
    const last = groups[groups.length - 1];
    if (
      last &&
      last.startTime === entry.startTime &&
      last.endTime === entry.endTime &&
      // Check the previous group's last day was the immediate predecessor.
      DAY_ORDER.indexOf(last.days[last.days.length - 1]! as typeof DAY_ORDER[number]) ===
        DAY_ORDER.indexOf(day) - 1
    ) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], startTime: entry.startTime, endTime: entry.endTime });
    }
  }

  return groups
    .map((g) => {
      const dayPart =
        g.days.length === 1
          ? DAY_LABEL[g.days[0] as keyof typeof DAY_LABEL]
          : `${DAY_LABEL[g.days[0] as keyof typeof DAY_LABEL]}–${DAY_LABEL[g.days[g.days.length - 1] as keyof typeof DAY_LABEL]}`;
      return `${dayPart} ${to12h(g.startTime)} – ${to12h(g.endTime)}`;
    })
    .join(" · ");
}

/** "17:30" → "5:30 PM". Returns the original on parse failure. */
export function to12h(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const min = m[2];
  if (h === 0) return `12:${min} AM`;
  if (h < 12) return `${h}:${min} AM`;
  if (h === 12) return `12:${min} PM`;
  return `${h - 12}:${min} PM`;
}

/**
 * Build the Rx pad DTO from a Doctor doc. Returns a missing-fields result if
 * required identity fields are absent — the page renders an empty state for
 * that case rather than producing a half-baked pad.
 */
export function buildRxPadDto(
  doctor: DoctorDocLike & { slug: string },
  origin: string,
): RxPadResult {
  const missing: RxPadMissing["missing"] = [];
  if (!doctor.name?.displayName || !doctor.name?.prefix) missing.push("name");
  if (!doctor.bmdcNumber) missing.push("bmdc");
  if (!doctor.chambers || doctor.chambers.length === 0) missing.push("chamber");
  // Recommended but not strictly required to print. Surface them in the empty
  // state so the doctor knows the pad will look better with them.
  if (!doctor.photo?.url) missing.push("photo");
  if (!doctor.qualifications || doctor.qualifications.length === 0)
    missing.push("qualifications");

  // Required gates the result; recommended just informs the page UI.
  const required = (["name", "bmdc", "chamber"] as const).filter((k) =>
    (missing as readonly string[]).includes(k),
  );
  if (required.length > 0) {
    return { ok: false, missing };
  }

  const degrees = (doctor.qualifications ?? [])
    .map((q) => q.degree)
    .filter(Boolean)
    .join(", ");
  const primarySpecialty =
    doctor.specialties?.find((s) => s.isPrimary)?.name ?? doctor.specialties?.[0]?.name ?? null;

  const chambers: RxPadChamber[] = (doctor.chambers ?? []).map((c) => ({
    name: c.name,
    address: [c.address, c.area, c.district].filter(Boolean).join(", "),
    phone: c.phone ?? null,
    schedule: formatSchedule(c.schedule ?? []),
    consultationFee:
      c.consultationFee?.amount && c.consultationFee.amount > 0
        ? `${c.consultationFee.amount} ${c.consultationFee.currency}`
        : null,
  }));

  return {
    ok: true,
    displayName: doctor.name.displayName,
    degrees,
    bmdcNumber: doctor.bmdcNumber ?? "",
    photoUrl: doctor.photo?.url ?? null,
    primarySpecialty,
    chambers,
    profileUrl: `${origin.replace(/\/$/, "")}/${doctor.slug}`,
  };
}
