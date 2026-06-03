"use server";

/**
 * Appointment Request — A.3 Server Actions.
 *
 *   createAppointmentRequestAction        (public, no auth)
 *   updateAppointmentRequestStatusAction  (doctor, owns the doctor doc)
 *
 * The create path is the only unauthenticated mutation in the app — we
 * defend with the canonical layered stack: honeypot first (free), then
 * IP rate-limit, then per-phone rate-limit, then Zod, then a doctor /
 * chamber lookup, then the insert. SMS notification is fire-and-forget so
 * a gateway hiccup doesn't fail the submission.
 */

import type { Loose } from "@/lib/db/models/loose";
import crypto from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor, AppointmentRequest } from "@/lib/db/models";
import {
  appointmentByIpLimiter,
  appointmentByPhoneLimiter,
} from "@/lib/redis/ratelimit";
import { sendSms } from "@/lib/sms/client";
import { normalizeBdPhone } from "@/lib/utils/phone";
import { env, publicEnv } from "@/lib/env";
import { CreateAppointmentSchema, sanitizeReason } from "@/lib/validators/appointment";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const VALID_STATUSES = ["pending", "seen", "booked", "rejected"] as const;
type AppointmentStatus = (typeof VALID_STATUSES)[number];

interface DoctorLean {
  _id: unknown;
  isClaimed: boolean;
  slug: string;
  chambers: Array<{ _id?: unknown; name?: string }>;
  contact: { publicPhone?: string | null; whatsapp?: string | null };
  name: { displayName?: string };
}

interface RequestLean {
  _id: unknown;
  doctorId: unknown;
}

/**
 * Create a new appointment request from the public profile.
 *
 * Honeypot hits return `{ ok: true }` silently — bots don't get to learn
 * that they tripped a guard. Rate-limit hits return a generic error.
 */
export async function createAppointmentRequestAction(
  raw: unknown,
): Promise<ActionResult<{ requestId: string }>> {
  const parsed = CreateAppointmentSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Honeypot fires a 'website' issue path — short-circuit silently.
    if (issue?.path?.[0] === "website") {
      return { ok: true, data: { requestId: "" } };
    }
    return { ok: false, error: issue?.message ?? "Invalid request." };
  }
  const data = parsed.data;

  const phone = normalizeBdPhone(data.patientPhone);
  if (!phone) {
    return { ok: false, error: "Enter a valid Bangladesh phone number." };
  }

  // Rate-limit per IP, then per phone. Both share the canonical Upstash
  // limiter — falls back to allow-all without Redis (dev path).
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const ipHash = crypto
    .createHash("sha256")
    .update(`${ip}|${env().AUTH_SECRET}`)
    .digest("hex")
    .slice(0, 32);

  const ipRl = await appointmentByIpLimiter.limit(`ip:${ipHash}`);
  if (!ipRl.success) {
    return { ok: false, error: "Too many requests from your network. Try again later." };
  }
  const phoneRl = await appointmentByPhoneLimiter.limit(`phone:${phone}`);
  if (!phoneRl.success) {
    return { ok: false, error: "Too many requests from this number. Try again later." };
  }

  await dbConnect();
  const doctor = await Doctor.findOne({ slug: data.slug })
    .select("_id isClaimed slug chambers contact name")
    .lean<DoctorLean | null>();

  if (!doctor || !doctor.isClaimed) {
    // Don't leak whether the slug exists.
    return { ok: false, error: "This profile isn't accepting requests yet." };
  }

  // Resolve the chamber. Chambers' `_id` is set by Mongoose so it serializes
  // to a string in the lean result — compare against the form value.
  const chamber = doctor.chambers.find((c) => String(c._id) === data.chamberId);
  if (!chamber) {
    return { ok: false, error: "Pick a chamber from the list." };
  }

  const reason = sanitizeReason(data.reason);
  const preferredDate = new Date(`${data.preferredDate}T00:00:00`);

  const created = (await (AppointmentRequest as unknown as Loose).create({
    doctorId: doctor._id,
    chamberId: String(chamber._id),
    chamberName: chamber.name ?? null,
    patientName: data.patientName.trim(),
    patientPhone: phone,
    preferredDate,
    preferredTimeWindow: data.preferredTimeWindow,
    reason,
    status: "pending",
    ipHash,
  })) as { _id: unknown };

  // Notify the doctor — fire-and-forget. The SMS goes to the chamber's
  // listed public phone (the doctor's claimed-line); we don't text the
  // chamber's own phone because that may not belong to the doctor.
  const doctorPhone =
    normalizeBdPhone(doctor.contact?.publicPhone ?? null) ??
    normalizeBdPhone(doctor.contact?.whatsapp ?? null);
  if (doctorPhone) {
    const inboxUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/dashboard/requests`;
    const smsBody = `doctor.id.bd: New appointment request from ${data.patientName.trim()} (${phone}). Open your inbox: ${inboxUrl}`;
    sendSms({ to: doctorPhone, body: smsBody })
      .then((r) => {
        if (r.sent) {
          AppointmentRequest.updateOne(
            { _id: created._id as never },
            { $set: { notifiedAt: new Date() } },
          ).catch(() => {});
        }
      })
      .catch((err) => console.error("appointment SMS failed", err));
  }

  // Revalidate so the doctor's inbox + sidebar badge see the new row.
  revalidatePath("/dashboard/requests");

  return { ok: true, data: { requestId: String(created._id) } };
}

/**
 * Doctor-side status update.
 *
 * Ownership: the request must belong to the doctor doc this user owns.
 * Status transitions are not strictly validated — any of the four states
 * is reachable from any other, since the doctor knows the real-world state
 * better than we do (e.g. a rejected request becomes pending if the patient
 * rebooks). The constants list is just the type guard.
 */
export async function updateAppointmentRequestStatusAction(input: {
  requestId: string;
  status: AppointmentStatus;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  if (!VALID_STATUSES.includes(input.status)) {
    return { ok: false, error: "Invalid status." };
  }

  await dbConnect();
  const doctor = await Doctor.findOne({ ownerId: session.user.id })
    .select("_id slug")
    .lean<{ _id: unknown; slug: string } | null>();
  if (!doctor) return { ok: false, error: "No profile found for your account." };

  const request = await AppointmentRequest.findById(input.requestId)
    .select("_id doctorId")
    .lean<RequestLean | null>();
  if (!request) return { ok: false, error: "Request not found." };
  if (String(request.doctorId) !== String(doctor._id)) {
    return { ok: false, error: "You don't own this request." };
  }

  await AppointmentRequest.updateOne(
    { _id: request._id as never },
    { $set: { status: input.status } },
  );

  revalidatePath("/dashboard/requests");
  revalidatePath("/dashboard");
  return { ok: true };
}
