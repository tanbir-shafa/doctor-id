import { Schema, model, models, type Model } from "mongoose";

/**
 * Health-guide / cornerstone article (SEO task 48 — the content-hub / E-E-A-T
 * pillar). Public articles live at /guides/[slug].
 *
 * The schema is **submission-ready from day one**: admin-authored articles go
 * `draft → published` directly, while the (future) doctor-submission flow writes
 * `pending_review` and an admin approves to `published` — same approval pattern
 * as ClaimRequest. Only `status: "published"` is ever public.
 *
 * `body` is Markdown, rendered to safe HTML at display time via
 * `renderBioMarkdown` (no raw HTML is trusted — matters once doctors can submit).
 */
const ArticleSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, trim: true, lowercase: true, index: { unique: true } },
    // Short summary — feeds the meta description + listing cards.
    excerpt: { type: String, default: "", trim: true, maxlength: 320 },
    // Markdown. Rendered through renderBioMarkdown() (sanitized) on display.
    body: { type: String, required: true, maxlength: 50000 },
    coverImageUrl: { type: String, default: null, trim: true },

    // Bangla version (optional). A guide appears at /bn/guides/[slug] only when
    // `bodyBn` is set; otherwise the bn surface has no entry for it and the en
    // page emits no bn hreflang. Same slug across locales (hreflang pairs them).
    titleBn: { type: String, default: null, trim: true, maxlength: 200 },
    excerptBn: { type: String, default: "", trim: true, maxlength: 320 },
    bodyBn: { type: String, default: null, maxlength: 50000 },
    // Specialty names this article relates to — drives internal links to the
    // matching specialty hubs (the "internal-link automation").
    specialties: { type: [String], default: [] },

    // "Key facts" — short, self-contained takeaways rendered as a TL;DR block
    // near the top. The liftable answer AI search engines quote + cite.
    // keyFactsBn is the Bangla counterpart shown on /bn/guides/[slug].
    keyFacts: { type: [String], default: [] },
    keyFactsBn: { type: [String], default: [] },

    // Authoritative references (WHO, DGHS, BMDC, peer-reviewed, …). Rendered as a
    // visible "References" list AND emitted as schema.org `citation` — the
    // sourcing signal Google/AI weigh for YMYL (health) content.
    citations: {
      type: [
        {
          _id: false,
          label: { type: String, trim: true, maxlength: 240 },
          url: { type: String, trim: true, maxlength: 500 },
          publisher: { type: String, trim: true, maxlength: 120, default: null },
        },
      ],
      default: [],
    },

    // Authorship (E-E-A-T) + the submission/approval workflow.
    authorType: { type: String, enum: ["admin", "doctor"], default: "admin" },
    authorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // Denormalized byline so the public page + JSON-LD render with no join.
    authorName: { type: String, default: "Daktar.Link Editorial", trim: true },

    // Medical/editorial review — set when an admin approves/publishes.
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewerName: { type: String, default: null, trim: true },
    // The reviewing clinician's credential string (e.g. "MBBS, FCPS (Medicine) ·
    // BMDC 12345") + optional link to their profile — emitted in `reviewedBy`.
    reviewerCredential: { type: String, default: null, trim: true, maxlength: 240 },
    reviewerProfileUrl: { type: String, default: null, trim: true, maxlength: 500 },
    reviewedAt: { type: Date, default: null },

    status: {
      type: String,
      enum: ["draft", "pending_review", "published"],
      default: "draft",
      index: true,
    },
    publishedAt: { type: Date, default: null },

    seoTitle: { type: String, default: null },
    seoDescription: { type: String, default: null },
  },
  { timestamps: true, collection: "articles" },
);

// Published-list ordering (newest first among published).
ArticleSchema.index({ status: 1, publishedAt: -1 });

export const Article: Model<unknown> =
  (models.Article as Model<unknown>) ?? model("Article", ArticleSchema);
