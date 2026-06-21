/**
 * Article query helpers (SEO task 48). Single source of truth for reading
 * articles — public surfaces only ever see `status: "published"`.
 */
import type { Loose } from "@/lib/db/models/loose";
import { dbConnect } from "@/lib/db/mongoose";
import { Article } from "@/lib/db/models";
import type { ArticleStatus } from "@/lib/validators/article";

/** Plain (serialized) article shape for RSC/client boundaries. */
export interface ArticleRecord {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  coverImageUrl: string | null;
  specialties: string[];
  authorType: "admin" | "doctor";
  authorName: string;
  reviewerName: string | null;
  reviewedAt: string | null;
  status: ArticleStatus;
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
}

function serialize(doc: unknown): ArticleRecord {
  return JSON.parse(JSON.stringify(doc)) as ArticleRecord;
}

/** Published articles, newest first — for the /guides hub + sitemap. */
export async function listPublishedArticles(limit = 60): Promise<ArticleRecord[]> {
  await dbConnect();
  const docs = await (Article as unknown as Loose)
    .find({ status: "published" })
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean();
  return (docs as unknown[]).map(serialize);
}

/** One published article by slug, or null (the public detail page). */
export async function getPublishedArticleBySlug(slug: string): Promise<ArticleRecord | null> {
  await dbConnect();
  const doc = await (Article as unknown as Loose)
    .findOne({ slug: slug.toLowerCase(), status: "published" })
    .lean();
  return doc ? serialize(doc) : null;
}

/** Every article (all statuses), newest-updated first — the admin queue. */
export async function listArticlesForAdmin(): Promise<ArticleRecord[]> {
  await dbConnect();
  const docs = await (Article as unknown as Loose).find({}).sort({ updatedAt: -1 }).lean();
  return (docs as unknown[]).map(serialize);
}

/** One article by id (admin edit), any status. */
export async function getArticleById(id: string): Promise<ArticleRecord | null> {
  await dbConnect();
  const doc = await (Article as unknown as Loose).findById(id).lean();
  return doc ? serialize(doc) : null;
}
