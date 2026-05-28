"use client";

import { useState } from "react";
import { Copy, Check, QrCode, Share2 } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "@/components/ui/button";

/**
 * Share + QR + copy-link control.
 *
 * Uses the native `navigator.share` API when available (mobile WebShare).
 * Falls back to clipboard copy + a QR code (which is what doctors print onto
 * business cards and prescription pads — the explicit ask from the PRD).
 */
export function ShareButton({ url, name }: { url: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  async function nativeShare() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: name, url });
        return;
      } catch {
        /* user cancelled, fall through to copy */
      }
    }
    void copyToClipboard();
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" type="button" onClick={nativeShare}>
        <Share2 className="size-4" aria-hidden="true" />
        Share
      </Button>
      <Button variant="outline" size="sm" type="button" onClick={copyToClipboard}>
        {copied ? <Check className="size-4 text-green-600" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      <Button variant="outline" size="sm" type="button" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
        <QrCode className="size-4" aria-hidden="true" />
        {showQr ? "Hide QR" : "QR code"}
      </Button>
      {showQr ? (
        <div className="ml-1 rounded-md border border-border bg-white p-2">
          <QRCodeCanvas value={url} size={120} level="M" includeMargin={false} />
        </div>
      ) : null}
    </div>
  );
}
