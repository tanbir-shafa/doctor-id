/**
 * Server-side QR encoder for embedding in PDFs / OG images.
 *
 * Uses the `qrcode` npm package (`qrcode.react` is a DOM-only renderer and
 * doesn't run server-side). Default error correction is `H` (≈30%) so the
 * code stays readable after photocopying or low-DPI printing — the Rx pad
 * is destined for chamber pads, so resilience matters.
 */

import QRCode from "qrcode";

export interface QrOptions {
  /** Pixel size of the rendered PNG. Defaults to 320 (fits the Rx pad header). */
  size?: number;
  /** Error correction level. H = 30% recovery, M = 15%, L = 7%. Default H. */
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
  /** Margin in QR modules. Default 1 (tight). */
  margin?: number;
}

/**
 * Render a PNG data URL for the given URL/text. Returns the raw
 * `data:image/png;base64,...` string suitable for `<Image src=...>` in
 * `@react-pdf/renderer` or `<img>` in HTML.
 */
export async function renderQrPngDataUrl(text: string, opts: QrOptions = {}): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: opts.errorCorrectionLevel ?? "H",
    margin: opts.margin ?? 1,
    width: opts.size ?? 320,
    color: { dark: "#0f172a", light: "#ffffff" },
  });
}
