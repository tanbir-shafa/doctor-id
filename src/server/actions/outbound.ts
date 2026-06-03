"use server";

/**
 * Admin Server Actions for the outbound dashboard (A.8).
 *
 *   addOptOutAction({ phone, reason })   — add a phone to the never-message list
 *   removeOptOutAction({ phone })        — undo (used when a doctor opts back in)
 *
 * Send dispatching itself happens via `scripts/outbound.ts` — these actions
 * cover the admin UI surface.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { OptOut } from "@/lib/db/models";
import { normalizeBdPhone } from "@/lib/utils/phone";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const AddOptOutSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  reason: z.string().max(200).optional().or(z.literal("")),
});

async function requireAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return { ok: false, error: "Admin only." };
  }
  return { ok: true, userId: session.user.id };
}

export async function addOptOutAction(input: {
  phone: string;
  reason?: string;
}): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const parsed = AddOptOutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const phone = normalizeBdPhone(parsed.data.phone);
  if (!phone) return { ok: false, error: "Enter a valid Bangladesh phone number." };

  await dbConnect();
  await OptOut.updateOne(
    { phone },
    {
      $setOnInsert: {
        phone,
        addedBy: guard.userId,
      },
      $set: { reason: parsed.data.reason || null },
    },
    { upsert: true },
  );

  revalidatePath("/admin/outbound");
  return { ok: true };
}

export async function removeOptOutAction(input: { phone: string }): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const phone = normalizeBdPhone(input?.phone);
  if (!phone) return { ok: false, error: "Enter a valid Bangladesh phone number." };

  await dbConnect();
  await OptOut.deleteOne({ phone });
  revalidatePath("/admin/outbound");
  return { ok: true };
}
