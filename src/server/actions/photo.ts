"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { presignUpload } from "@/lib/s3/presign";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const ALLOWED = ["profile", "cover", "verification"] as const;
type Kind = (typeof ALLOWED)[number];

export async function presignProfileUpload(input: {
  kind: Kind;
  contentType: string;
  contentLength: number;
}): Promise<ActionResult<{ uploadUrl: string; publicUrl: string; key: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  if (!ALLOWED.includes(input.kind)) return { ok: false, error: "Invalid upload kind." };

  try {
    const result = await presignUpload({
      prefix: `${input.kind}/${session.user.id}`,
      contentType: input.contentType,
      contentLength: input.contentLength,
      kind: input.kind === "verification" ? "document" : "image",
    });
    if (!result) {
      return {
        ok: false,
        error: "Photo uploads aren't configured in this environment. Ask the admin to set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY.",
      };
    }
    return { ok: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not prepare upload.";
    return { ok: false, error: message };
  }
}

/**
 * Confirms an upload completed and writes the {url, s3Key} pair to the doctor doc.
 * Called by the client after the PUT to S3 finishes.
 */
export async function confirmProfilePhoto(input: {
  kind: "profile" | "cover";
  url: string;
  key: string;
}): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  await dbConnect();
  const doctor = await Doctor.findOne({ ownerId: session.user.id });
  if (!doctor) return { ok: false, error: "No profile found." };

  const field = input.kind === "profile" ? "photo" : "coverPhoto";
  doctor.set(field, { url: input.url, s3Key: input.key });
  await doctor.save();
  revalidatePath(`/${doctor.get("slug")}`);
  revalidatePath("/dashboard/photos");
  return { ok: true };
}
