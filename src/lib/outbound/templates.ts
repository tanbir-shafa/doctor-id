/**
 * Outbound SMS templates + lightweight renderer.
 *
 * Two-letter design rules:
 *   1. **Identical bodies batch.** A template with no `{{placeholders}}` (or
 *      with placeholders that all resolve to the same string across a
 *      cohort) yields one body shared by every recipient — `sendSmsBatch`
 *      can then send 20 numbers per gateway call.
 *   2. **Personalized bodies don't.** Any per-doctor placeholder
 *      (e.g. `{{firstName}}`) makes each body unique → MDL needs one call
 *      per recipient. Slower; richer engagement.
 *
 * Sprint A's first campaign ships the **identical-body** variant so the
 * 3,237 Popular Diagnostic doctors can be reached in ~165 API calls
 * instead of ~3,237. Personalized variants are configured but stay opt-in
 * via the `--template=*-personal` flag.
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
      "English broadcast — identical body for every doctor. Batchable 20-per-call.",
    body: "Daktar.Link: Your professional profile is ready. Claim it free + get a printable A5 prescription pad: https://daktar.link/claim. Reply STOP to opt out.",
    personalized: false,
    language: "en",
  },
  "bn-claim-rx-pad": {
    id: "bn-claim-rx-pad",
    description:
      "Bangla broadcast — identical body for every doctor. Batchable 20-per-call.",
    body: "Daktar.Link: আপনার প্রোফাইল প্রস্তুত। বিনামূল্যে দাবি করুন + ফ্রি প্রেসক্রিপশন প্যাড পান: https://daktar.link/claim। বন্ধ করতে STOP লিখে রিপ্লাই করুন।",
    personalized: false,
    language: "bn",
  },
  "en-claim-rx-pad-personal": {
    id: "en-claim-rx-pad-personal",
    description:
      "English personalized — uses {{firstName}}; 1-per-call, higher engagement.",
    body: "Daktar.Link: Hi Dr. {{firstName}}, your profile is ready. Claim it free: https://daktar.link/{{slug}}. Reply STOP to opt out.",
    personalized: true,
    language: "en",
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
