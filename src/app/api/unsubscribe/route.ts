import { type NextRequest } from "next/server";
import { dbConnect } from "@/lib/db/mongoose";
import { OptOut } from "@/lib/db/models";
import { verifyUnsubscribe } from "@/lib/outbound/unsubscribe-token";
import { unsubscribeRateLimiter } from "@/lib/redis/ratelimit";
import { clientIp } from "@/lib/utils/request-ip";

/**
 * One-click email unsubscribe — `GET /api/unsubscribe?token=<signed>`.
 *
 * Public + auth-less by design (an email client follows the link directly, so a
 * CSRF-gated Server Action won't work). The token is HMAC-signed
 * (unsubscribe-token.ts), so the address can't be tampered with and never
 * appears in plaintext in the URL. On a valid token we add the address to the
 * `OptOut` roster (channel "email"), which the campaign script filters before
 * every send. Both success and failure return 200 with a tiny HTML page (no
 * enumeration — an invalid token looks the same as an expired one).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function page(title: string, message: string): Response {
  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Daktar.Link</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f6f7f9;margin:0;padding:48px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;text-align:center;">
    <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${title}</h1>
    <p style="font-size:15px;color:#374151;margin:0;">${message}</p>
  </div>
</body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest): Promise<Response> {
  // Per-IP abuse guard (fails closed in prod if Redis is down — see ratelimit.ts).
  const ip = clientIp(req.headers);
  const limit = await unsubscribeRateLimiter.limit(`unsub:${ip}`);
  if (!limit.success) {
    return page("Too many requests", "Please wait a moment and try the link again.");
  }

  const token = req.nextUrl.searchParams.get("token");
  const email = verifyUnsubscribe(token);
  if (!email) {
    return page(
      "Link invalid or expired",
      "We couldn't process this unsubscribe link. If you keep receiving emails, reply to one and ask us to stop.",
    );
  }

  try {
    await dbConnect();
    await OptOut.updateOne(
      { channel: "email", email },
      { $setOnInsert: { channel: "email", email }, $set: { reason: "unsubscribe-link" } },
      { upsert: true },
    );
  } catch (err) {
    console.error("[unsubscribe] failed to record opt-out:", err);
    return page(
      "Something went wrong",
      "We couldn't record your request right now. Please try again shortly.",
    );
  }

  return page(
    "You've been unsubscribed",
    "You won't receive any more campaign emails from Daktar.Link at this address.",
  );
}
