"use server";

/**
 * Admin Server Actions for the outbound dashboard (A.8).
 *
 *   addOptOutAction({ channel, phone?, email?, reason })  — add to the never-message list
 *   removeOptOutAction({ channel, phone?, email? })       — undo (opt back in)
 *
 * Channel-aware: SMS opt-outs key on a normalized phone, email opt-outs on a
 * normalized email. Send dispatching itself happens via `scripts/outbound.ts` —
 * these actions cover the admin UI surface.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { OptOut } from "@/lib/db/models";
import { normalizeBdPhone } from "@/lib/utils/phone";
import { normalizeEmail } from "@/lib/utils/email";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const AddOptOutSchema = z.object({
  channel: z.enum(["sms", "email"]).default("sms"),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().optional().or(z.literal("")),
  reason: z.string().max(200).optional().or(z.literal("")),
});

async function requireAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return { ok: false, error: "Admin only." };
  }
  return { ok: true, userId: session.user.id };
}

export async function addOptOutAction(input: {
  channel?: "sms" | "email";
  phone?: string;
  email?: string;
  reason?: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const parsed = AddOptOutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { channel, reason } = parsed.data;

  await dbConnect();

  if (channel === "email") {
    const email = normalizeEmail(parsed.data.email);
    if (!email) return { ok: false, error: "Enter a valid email address." };
    await OptOut.updateOne(
      { email },
      { $setOnInsert: { channel: "email", email, addedBy: guard.userId }, $set: { reason: reason || null } },
      { upsert: true },
    );
  } else {
    const phone = normalizeBdPhone(parsed.data.phone);
    if (!phone) return { ok: false, error: "Enter a valid Bangladesh phone number." };
    await OptOut.updateOne(
      { phone },
      { $setOnInsert: { channel: "sms", phone, addedBy: guard.userId }, $set: { reason: reason || null } },
      { upsert: true },
    );
  }

  revalidatePath("/admin/outbound");
  return { ok: true };
}

export async function removeOptOutAction(input: {
  channel?: "sms" | "email";
  phone?: string;
  email?: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  await dbConnect();

  if (input?.channel === "email") {
    const email = normalizeEmail(input?.email);
    if (!email) return { ok: false, error: "Enter a valid email address." };
    await OptOut.deleteOne({ email });
  } else {
    const phone = normalizeBdPhone(input?.phone);
    if (!phone) return { ok: false, error: "Enter a valid Bangladesh phone number." };
    await OptOut.deleteOne({ phone });
  }

  revalidatePath("/admin/outbound");
  return { ok: true };
}
