"use server";

/**
 * Free Shafa EMR bundling — A.5 Server Actions (manual provisioning).
 *
 *   markEmrReadyAction({ userId, emrAccountEmail })  // admin
 *   declineEmrAction()                                // doctor
 *
 * Provisioning itself is offline: ops creates the account in the EMR-side
 * console and emails credentials. These actions just track the status the
 * dashboard banner reads — there's no SSO or API call in Sprint A.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { User } from "@/lib/db/models";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const MarkReadySchema = z.object({
  userId: z.string().min(1, "userId is required"),
  emrAccountEmail: z.string().email("Enter a valid email"),
});

/**
 * Flip an EMR seat from `pending` to `ready`. Admin only.
 *
 * The atomic guard `emr.seatStatus: 'pending'` makes this idempotent — if a
 * second admin clicks "Mark ready" after the first won the race, the second
 * call returns success without overwriting the original `readyAt`.
 */
export async function markEmrReadyAction(input: {
  userId: string;
  emrAccountEmail: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return { ok: false, error: "Admin only." };
  }

  const parsed = MarkReadySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  await dbConnect();
  const result = await User.findOneAndUpdate(
    { _id: parsed.data.userId, "emr.seatStatus": "pending" },
    {
      $set: {
        "emr.seatStatus": "ready",
        "emr.readyAt": new Date(),
        "emr.accountEmail": parsed.data.emrAccountEmail.toLowerCase(),
      },
    },
    { returnDocument: "after" },
  );

  if (!result) {
    // The user wasn't pending — either they declined, already ready, or
    // missing. Treat "already ready" as success so the admin can re-issue
    // without seeing a confusing error.
    const fresh = await User.findById(parsed.data.userId)
      .select("emr.seatStatus")
      .lean<{ emr?: { seatStatus?: string } } | null>();
    if (fresh?.emr?.seatStatus === "ready") {
      return { ok: true };
    }
    return {
      ok: false,
      error: "That account isn't pending an EMR seat — it may have been declined or removed.",
    };
  }

  revalidatePath("/admin/emr-queue");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Doctor opts out of the EMR seat. Sets `declined` so the dashboard banner
 * disappears. Re-opening is admin-only (avoid spam toggle).
 */
export async function declineEmrAction(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  await dbConnect();
  const result = await User.findOneAndUpdate(
    { _id: session.user.id, "emr.seatStatus": "pending" },
    {
      $set: {
        "emr.seatStatus": "declined",
        "emr.declinedAt": new Date(),
      },
    },
    { returnDocument: "after" },
  );

  if (!result) {
    // Idempotent: already declined / already ready / never requested.
    return { ok: true };
  }

  revalidatePath("/dashboard");
  revalidatePath("/admin/emr-queue");
  return { ok: true };
}
