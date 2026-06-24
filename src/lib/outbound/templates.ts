/**
 * Outbound SMS templates + lightweight renderer.
 *
 * Batching trade-off:
 *   1. **Identical bodies batch.** A template with no `{{placeholders}}` yields
 *      one body shared by every recipient — `sendSmsBatch` sends up to 100
 *      numbers per SSL bulk call.
 *   2. **Personalized bodies don't.** Any per-doctor placeholder
 *      (e.g. `{{slug}}`) makes each body unique → they pool into SSL's dynamic
 *      endpoint (still ≤100/call) or one MDL call per recipient.
 *
 * The claim templates are **personalized** so each message deep-links to the
 * doctor's own claim page (`/auth/register?slug=…`) — the highest-converting
 * landing (lands on their pre-filled profile) and the basis for claim
 * attribution. The modest send-cost bump (bulk → dynamic) is intentional.
 */

export interface OutboundTemplate {
  id: string;
  /** Short human description for the admin dashboard. */
  description: string;
  /** Default body. Placeholders use {{name}} mustache-style; case-sensitive. */
  body: string;
  /** True if the body has any placeholders → bodies will differ per recipient. */
  personalized: boolean;
  /** Language of the body — surfaces in the dashboard segment-cost estimate. */
  language: "en" | "bn";
}

/**
 * The starter Sprint A templates. Operators pick by `id` from the CLI.
 * Add more here — keep `personalized` accurate so the gateway-batching
 * optimization doesn't lie about its expected fan-out.
 */
export const OUTBOUND_TEMPLATES: Record<string, OutboundTemplate> = {
  "en-claim-rx-pad": {
    id: "en-claim-rx-pad",
    description:
      "English personalized claim invite — deep-links to /auth/register?slug=. SSL dynamic (≤100/call).",
    body: "Daktar.Link: Dr. {{firstName}}, claim your free doctor profile + printable prescription pad: https://daktar.link/auth/register?slug={{slug}} Reply STOP to opt out.",
    personalized: true,
    language: "en",
  },
  "bn-claim-rx-pad": {
    id: "bn-claim-rx-pad",
    description:
      "Bangla personalized claim invite — deep-links to /auth/register?slug=. SSL dynamic (≤100/call).",
    body: "Daktar.Link: ডা. {{firstName}}, আপনার ফ্রি প্রোফাইল দাবি করুন: https://daktar.link/auth/register?slug={{slug}} বন্ধ করতে STOP লিখুন।",
    personalized: true,
    language: "bn",
  },
};

/**
 * Substitute `{{name}}` placeholders. Unknown placeholders are left
 * intact — script-level validation can catch them before sending.
 */
export function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? `{{${key}}}` : v;
  });
}

/**
 * Number of SMS segments billed for a body.
 *
 * ASCII messages chunk at 160 chars; anything with non-ASCII (Bangla,
 * emoji) drops to 70 chars per segment on the BD gateways we've checked.
 * Concatenated SMS headers further reduce the cap to 153/67 — we use the
 * conservative ceiling for the dashboard cost estimate.
 */
export function segmentCount(body: string): { unicode: boolean; segments: number } {
  const unicode = /[^\x00-\x7F]/.test(body);
  const limit = unicode ? 70 : 160;
  if (body.length === 0) return { unicode, segments: 0 };
  return { unicode, segments: Math.ceil(body.length / limit) };
}

/**
 * Returns true when the rendered body contains an unresolved `{{x}}`
 * placeholder. Use this as a guard before paying for a chunk that's
 * obviously broken.
 */
export function hasUnresolvedPlaceholders(rendered: string): boolean {
  return /\{\{\w+\}\}/.test(rendered);
}
