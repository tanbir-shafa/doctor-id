/**
 * Server-side image optimization — runs on every uploaded image before it
 * streams to S3 (see the upload paths in `lib/s3/doctor-photo.ts`,
 * `lib/s3/upload-doc.ts`, and `actions/photo.ts`). The goal is to shrink what we
 * store and what the `next/image` optimizer + OG route later have to fetch:
 * uploads commonly land as multi-MB phone photos; capping the long edge +
 * recompressing typically drops them 80–90% with no visible quality loss.
 *
 * Design choices:
 *   - **Format-preserving.** We don't transcode to WebP at upload — `next/image`
 *     already negotiates AVIF/WebP at display time, and the private bucket
 *     (Gov ID / selfie) is reviewed as raw bytes, so keeping the original
 *     container avoids key/MIME churn and a worse review surface. Dimension
 *     capping is ~90% of the byte win.
 *   - **EXIF orientation is baked in, then metadata stripped.** `.rotate()` with
 *     no argument auto-orients from the EXIF Orientation tag (phone cameras
 *     routinely store sideways pixels + a flag) and drops all metadata,
 *     including GPS, from the output.
 *   - **Decompression-bomb guard.** A byte-size limit (enforced upstream) does
 *     not bound pixel count — a small PNG can decode to gigabytes. We reject
 *     images whose dimensions exceed `maxInputPixels`. This matters most on the
 *     unauthenticated registration-selfie path.
 *   - **Never block a valid upload.** A decode failure (corrupt / bomb) is
 *     rejected; but a recompression failure *after* a clean decode falls back to
 *     the original buffer so optimization is best-effort, never a funnel killer.
 */

import sharp from "sharp";

/** MIME types we resize/recompress. Everything else (e.g. PDF) passes through. */
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/** Default decoded-pixel ceiling (≈100 MP) — decompression-bomb guard. */
const DEFAULT_MAX_INPUT_PIXELS = 100_000_000;

export interface OptimizeOptions {
  /** Longest-edge cap in px; the image is scaled to fit inside maxEdge×maxEdge. */
  maxEdge: number;
  /** Encoder quality (1–100) for jpeg/webp. */
  quality: number;
  /** Override the decoded-pixel ceiling (mainly for tests). */
  maxInputPixels?: number;
  /**
   * Byte floor below which we skip the lossy re-encode and keep the original
   * untouched. Re-encoding an already-small/already-compressed image (e.g. a
   * ~200px thumbnail) tends to add visible artifacts for little or no byte
   * saving. The decompression-bomb guard still runs first, so a small-byte/
   * huge-pixel bomb is rejected before the floor applies. Unset = always
   * optimize (the live upload path's behavior is unchanged).
   */
  minBytes?: number;
}

export type OptimizeResult =
  | { ok: true; buffer: Buffer; sizeBytes: number; optimized: boolean }
  | { ok: false; error: string };

/**
 * Resize + recompress an image buffer (format-preserving). Non-image MIME types
 * pass through untouched. Returns `{ ok: false }` only when the input can't be
 * safely decoded (corrupt or over the pixel ceiling) — callers surface that as
 * the upload error.
 */
export async function optimizeImageBuffer(
  input: Buffer,
  mimeType: string,
  opts: OptimizeOptions,
): Promise<OptimizeResult> {
  // Non-image (e.g. application/pdf) — store as-is.
  if (!IMAGE_MIME_TYPES.has(mimeType)) {
    return { ok: true, buffer: input, sizeBytes: input.length, optimized: false };
  }

  const maxInputPixels = opts.maxInputPixels ?? DEFAULT_MAX_INPUT_PIXELS;

  // Decode probe (header only): rejects corrupt input, and lets us bound pixel
  // count before committing CPU to a full decode.
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    return { ok: false, error: "That image looks corrupted — try a different file." };
  }
  if (!meta.width || !meta.height || meta.width * meta.height > maxInputPixels) {
    return { ok: false, error: "That image is too large to process — try a smaller one." };
  }

  // Size floor: a valid, already-small image is kept as-is — re-encoding it would
  // risk artifacts for little/no gain. Placed AFTER the bomb guard so a tiny-byte/
  // huge-pixel image is still rejected above, never silently passed through here.
  if (opts.minBytes !== undefined && input.length < opts.minBytes) {
    return { ok: true, buffer: input, sizeBytes: input.length, optimized: false };
  }

  // Resize + re-encode. A failure here (after a clean decode) is non-fatal: fall
  // back to the original so a valid upload is never blocked.
  try {
    const pipeline = sharp(input, { limitInputPixels: maxInputPixels, failOn: "error" })
      .rotate() // bake EXIF orientation + strip metadata
      .resize(opts.maxEdge, opts.maxEdge, { fit: "inside", withoutEnlargement: true });

    let encoded: sharp.Sharp;
    if (mimeType === "image/png") {
      encoded = pipeline.png({ compressionLevel: 9, palette: true });
    } else if (mimeType === "image/webp") {
      encoded = pipeline.webp({ quality: opts.quality });
    } else {
      encoded = pipeline.jpeg({ quality: opts.quality, mozjpeg: true, progressive: true });
    }

    const buffer = await encoded.toBuffer();
    // Already-small / already-optimized images can grow under re-encode (e.g. a
    // tiny image whose dimensions didn't change). Keep whichever is smaller.
    if (buffer.length >= input.length) {
      return { ok: true, buffer: input, sizeBytes: input.length, optimized: false };
    }
    return { ok: true, buffer, sizeBytes: buffer.length, optimized: true };
  } catch {
    return { ok: true, buffer: input, sizeBytes: input.length, optimized: false };
  }
}

/**
 * Tiny blurred preview as a base64 `data:` URI, for `next/image`
 * `placeholder="blur"` (the hero photo fades in instead of popping). Best-effort
 * — returns `null` on any failure so it never blocks an upload. Cached on
 * `Doctor.photo.blurDataUrl` (CLAUDE.md #12 denormalized cache).
 */
export async function generateBlurDataUrl(input: Buffer): Promise<string | null> {
  try {
    const buf = await sharp(input, { failOn: "error" })
      .rotate()
      .resize(20, 20, { fit: "inside" })
      .webp({ quality: 50 })
      .toBuffer();
    return `data:image/webp;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
