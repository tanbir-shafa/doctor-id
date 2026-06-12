// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderQrPngDataUrl } from "@/lib/qr/server";

describe("renderQrPngDataUrl", () => {
  it("returns a PNG data URL", async () => {
    const url = await renderQrPngDataUrl("https://daktar.link/dr-karim-rahman-cardiologist");
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("decodes to bytes starting with the PNG signature", async () => {
    const url = await renderQrPngDataUrl("https://example.com");
    const base64 = url.split(",")[1]!;
    const bytes = Buffer.from(base64, "base64");
    // PNG file signature: 89 50 4E 47 0D 0A 1A 0A
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
  });

  it("honors size + error correction options", async () => {
    const url = await renderQrPngDataUrl("https://example.com", {
      size: 128,
      errorCorrectionLevel: "L",
    });
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
    // Smaller PNGs decode to fewer bytes; rough sanity check.
    const bytes = Buffer.from(url.split(",")[1]!, "base64");
    expect(bytes.byteLength).toBeGreaterThan(50);
  });
});
