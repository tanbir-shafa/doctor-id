import { describe, it, expect } from "vitest";
import { sniffImageMime } from "@/lib/utils/image-sniff";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const webp = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe("sniffImageMime — validates real bytes, not Content-Type", () => {
  it("detects JPEG", () => {
    expect(sniffImageMime(jpeg)).toBe("image/jpeg");
  });

  it("detects PNG", () => {
    expect(sniffImageMime(png)).toBe("image/png");
  });

  it("detects WebP (RIFF....WEBP)", () => {
    expect(sniffImageMime(webp)).toBe("image/webp");
  });

  it("rejects a non-image blob even if it claims to be an image", () => {
    const evil = Buffer.from("<?php system($_GET[0]); ?>", "utf8");
    expect(sniffImageMime(evil)).toBeNull();
  });

  it("rejects a too-short buffer", () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it("rejects a RIFF container that isn't WEBP (e.g. WAV)", () => {
    const wav = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(sniffImageMime(wav)).toBeNull();
  });
});
