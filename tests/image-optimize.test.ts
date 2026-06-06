// @vitest-environment node
//
// Unit tests for the server-side image optimizer. sharp is native (Node), so
// this file forces the node environment (the suite defaults to jsdom). DB-less.

import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { optimizeImageBuffer, generateBlurDataUrl } from "@/lib/images/optimize";

type Fmt = "jpeg" | "png" | "webp";

/** A solid-color test image of the given format + dimensions. */
async function makeImage(format: Fmt, width = 2000, height = 1500): Promise<Buffer> {
  const base = sharp({
    create: { width, height, channels: 3, background: { r: 180, g: 90, b: 40 } },
  });
  if (format === "png") return base.png().toBuffer();
  if (format === "webp") return base.webp().toBuffer();
  return base.jpeg({ quality: 95 }).toBuffer();
}

describe("optimizeImageBuffer", () => {
  it("caps the long edge to maxEdge and preserves the JPEG format", async () => {
    const input = await makeImage("jpeg", 2000, 1500);
    const result = await optimizeImageBuffer(input, "image/jpeg", { maxEdge: 1024, quality: 80 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.optimized).toBe(true);
    expect(result.sizeBytes).toBe(result.buffer.length);

    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1024);
    expect(meta.width).toBeLessThanOrEqual(1024);
    expect(meta.height).toBeLessThanOrEqual(1024);
  });

  it("preserves PNG and WebP formats (no transcode at upload)", async () => {
    const png = await makeImage("png", 1600, 1200);
    const pngOut = await optimizeImageBuffer(png, "image/png", { maxEdge: 1024, quality: 80 });
    expect(pngOut.ok).toBe(true);
    if (pngOut.ok) expect((await sharp(pngOut.buffer).metadata()).format).toBe("png");

    const webp = await makeImage("webp", 1600, 1200);
    const webpOut = await optimizeImageBuffer(webp, "image/webp", { maxEdge: 1024, quality: 80 });
    expect(webpOut.ok).toBe(true);
    if (webpOut.ok) expect((await sharp(webpOut.buffer).metadata()).format).toBe("webp");
  });

  it("bakes EXIF orientation into the pixels and strips the tag", async () => {
    // Orientation 6 = rotate 90° CW. A landscape source should come out portrait.
    const input = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Sanity: the source really carries orientation 6.
    expect((await sharp(input).metadata()).orientation).toBe(6);

    const result = await optimizeImageBuffer(input, "image/jpeg", { maxEdge: 1000, quality: 80 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const meta = await sharp(result.buffer).metadata();
    // Rotation applied → now portrait; orientation tag normalized away.
    expect(meta.height).toBeGreaterThan(meta.width ?? 0);
    expect(meta.orientation === undefined || meta.orientation === 1).toBe(true);
  });

  it("passes non-image MIME types (e.g. PDF) through untouched", async () => {
    const input = Buffer.from("%PDF-1.4 not a real pdf but not an image either");
    const result = await optimizeImageBuffer(input, "application/pdf", {
      maxEdge: 2400,
      quality: 85,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.optimized).toBe(false);
    expect(result.buffer.equals(input)).toBe(true);
    expect(result.sizeBytes).toBe(input.length);
  });

  it("rejects corrupt / non-decodable input claiming to be an image", async () => {
    const garbage = Buffer.from("this is plain text, definitely not a JPEG");
    const result = await optimizeImageBuffer(garbage, "image/jpeg", { maxEdge: 1024, quality: 80 });
    expect(result.ok).toBe(false);
  });

  it("rejects images over the decoded-pixel ceiling (decompression-bomb guard)", async () => {
    const input = await makeImage("jpeg", 2000, 1500); // 3,000,000 px
    const result = await optimizeImageBuffer(input, "image/jpeg", {
      maxEdge: 1024,
      quality: 80,
      maxInputPixels: 1_000_000, // below the image's pixel count
    });
    expect(result.ok).toBe(false);
  });

  it("keeps the original untouched when below the minBytes floor", async () => {
    const input = await makeImage("jpeg", 100, 100); // a tiny image, well under any floor
    const result = await optimizeImageBuffer(input, "image/jpeg", {
      maxEdge: 1024,
      quality: 80,
      minBytes: 1_000_000, // floor far above the input → skip the re-encode
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.optimized).toBe(false);
    expect(result.buffer.equals(input)).toBe(true); // exact original bytes, no recompression
    expect(result.sizeBytes).toBe(input.length);
  });

  it("still compresses images at or above the minBytes floor", async () => {
    const input = await makeImage("jpeg", 2000, 1500);
    const result = await optimizeImageBuffer(input, "image/jpeg", {
      maxEdge: 1024,
      quality: 80,
      minBytes: 1024, // input is larger than this → optimize as normal
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.optimized).toBe(true);
    expect(Math.max((await sharp(result.buffer).metadata()).width ?? 0, 0)).toBeLessThanOrEqual(
      1024,
    );
  });

  it("still rejects a decompression bomb even when it is below the minBytes floor", async () => {
    const input = await makeImage("jpeg", 2000, 1500); // small bytes, 3,000,000 px
    const result = await optimizeImageBuffer(input, "image/jpeg", {
      maxEdge: 1024,
      quality: 80,
      maxInputPixels: 1_000_000, // bomb guard should fire…
      minBytes: 10_000_000, // …before the floor (input bytes are well under this)
    });
    expect(result.ok).toBe(false); // guard runs before the floor early-return
  });
});

describe("generateBlurDataUrl", () => {
  it("returns a small base64 WebP data URI for a valid image", async () => {
    const input = await makeImage("jpeg", 2000, 1500);
    const url = await generateBlurDataUrl(input);
    expect(url).not.toBeNull();
    expect(url).toMatch(/^data:image\/webp;base64,/);
    // A 20px blur is tiny — guard against it ballooning.
    expect((url as string).length).toBeLessThan(2000);
  });

  it("returns null on non-decodable input", async () => {
    const url = await generateBlurDataUrl(Buffer.from("nope"));
    expect(url).toBeNull();
  });
});
