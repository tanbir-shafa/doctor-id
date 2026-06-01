"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import crypto from "node:crypto";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Doctor } from "@/lib/db/models";
import { presignUpload } from "@/lib/s3/presign";
import { publicApiRateLimiter } from "@/lib/redis/ratelimit";

type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const ALLOWED = ["profile", "cover", "verification"] as const;
type Kind = (typeof ALLOWED)[number];

/**
 * Unauthenticated presign for the registration flow.
 *
 * Doctors can attach NID / selfie / supporting docs while filling the
 * /auth/register form — before they have a session. Returns a presigned
 * PUT URL that lets the browser upload directly to S3, then the resulting
 * `s3Key` is submitted with the rest of the registration payload.
 *
 * Rate-limited by IP to prevent abuse. The S3 prefix is the IP hash + the
 * date so abandoned uploads are easy to garbage-collect later.
 */
export async function presignRegistrationDocAction(input: {
  contentType: string;
  contentLength: number;
}): Promise<ActionResult<{ uploadUrl: string; publicUrl: string; key: string }>> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);

  const rl = await publicApiRateLimiter.limit(`reg-presign:${ipHash}`);
  if (!rl.success) {
    return { ok: false, error: "Too many uploads from this IP. Try again in a minute." };
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const result = await presignUpload({
      prefix: `registration-docs/${today}/${ipHash}`,
      contentType: input.contentType,
      contentLength: input.contentLength,
      kind: "document",
    });
    if (!result) {
      return {
        ok: false,
        error:
          "Uploads aren't configured in this environment. Continue without attaching documents — admin will reach out by phone.",
      };
    }
    return { ok: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not prepare upload.";
    return { ok: false, error: message };
  }
}

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
  // PhotoSchema requires s3Bucket + visibility. We don't have the bucket
  // back from confirmProfilePhoto (presign returns key + publicUrl), so
  // derive it from env. `file` stays null because dashboard photos don't
  // create File docs yet (B-tier follow-up).
  const { env } = await import("@/lib/env");
  doctor.set(field, {
    file: null,
    url: input.url,
    s3Bucket: env().S3_BUCKET,
    s3Key: input.key,
    visibility: "public",
  });
  await doctor.save();
  revalidatePath(`/${doctor.get("slug")}`);
  revalidatePath("/dashboard/photos");
  return { ok: true };
}
