"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { auth } from "@/lib/auth/config";
import { dbConnect } from "@/lib/db/mongoose";
import { Article } from "@/lib/db/models";
import type { Loose } from "@/lib/db/models/loose";
import { articleInputSchema, ARTICLE_STATUSES, type ArticleStatus } from "@/lib/validators/article";

type Result = { ok: true; slug?: string } | { ok: false; error: string };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Not signed in." };
  if (session.user.role !== "admin") return { ok: false as const, error: "Admin only." };
  return {
    ok: true as const,
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "Daktar.Link Editorial",
  };
}

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** One reference per line, "Label | URL | Publisher?" (publisher optional). */
function parseCitations(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = "", url = "", publisher = ""] = line.split("|").map((p) => p.trim());
      return { label, url, publisher };
    })
    .filter((c) => c.label && c.url);
}

function parseForm(form: FormData) {
  const specialties = String(form.get("specialties") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const splitLines = (raw: string) =>
    raw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  const keyFacts = splitLines(String(form.get("keyFacts") ?? ""));
  const keyFactsBn = splitLines(String(form.get("keyFactsBn") ?? ""));
  const citations = parseCitations(String(form.get("citations") ?? ""));
  return articleInputSchema.safeParse({
    title: String(form.get("title") ?? ""),
    slug: String(form.get("slug") ?? ""),
    excerpt: String(form.get("excerpt") ?? ""),
    body: String(form.get("body") ?? ""),
    coverImageUrl: String(form.get("coverImageUrl") ?? ""),
    specialties,
    keyFacts,
    keyFactsBn,
    citations,
    authorName: String(form.get("authorName") ?? ""),
    reviewerName: String(form.get("reviewerName") ?? ""),
    reviewerCredential: String(form.get("reviewerCredential") ?? ""),
    reviewerProfileUrl: String(form.get("reviewerProfileUrl") ?? ""),
    status: String(form.get("status") ?? "draft"),
    titleBn: String(form.get("titleBn") ?? ""),
    excerptBn: String(form.get("excerptBn") ?? ""),
    bodyBn: String(form.get("bodyBn") ?? ""),
  });
}

function revalidate(slug?: string) {
  revalidatePath("/admin/articles");
  revalidatePath("/guides");
  revalidatePath("/bn/guides");
  if (slug) {
    revalidatePath(`/guides/${slug}`);
    revalidatePath(`/bn/guides/${slug}`);
  }
}

export async function createArticleAction(form: FormData): Promise<Result> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return ctx;
  const parsed = parseForm(form);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;
  const slug = data.slug && data.slug.length ? data.slug : toSlug(data.title);
  if (!slug) return { ok: false, error: "Couldn't derive a slug from the title — set one manually." };

  await dbConnect();
  const clash = await (Article as unknown as Loose).findOne({ slug });
  if (clash) return { ok: false, error: "An article with this slug already exists." };

  const publishing = data.status === "published";
  const now = new Date();
  const citations = (data.citations ?? []).map((c) => ({
    label: c.label,
    url: c.url,
    publisher: c.publisher || null,
  }));
  await (Article as unknown as Loose).create({
    title: data.title,
    slug,
    excerpt: data.excerpt ?? "",
    body: data.body,
    coverImageUrl: data.coverImageUrl || null,
    titleBn: data.titleBn || null,
    excerptBn: data.excerptBn ?? "",
    bodyBn: data.bodyBn || null,
    specialties: data.specialties ?? [],
    keyFacts: data.keyFacts ?? [],
    keyFactsBn: data.keyFactsBn ?? [],
    citations,
    authorType: "admin",
    authorId: ctx.id,
    authorName: data.authorName || ctx.name,
    reviewerCredential: data.reviewerCredential || null,
    reviewerProfileUrl: data.reviewerProfileUrl || null,
    status: data.status,
    publishedAt: publishing ? now : null,
    // reviewerName is the actual reviewing clinician if supplied, else the
    // publishing admin (only meaningful once reviewed/published).
    reviewedBy: publishing ? ctx.id : null,
    reviewerName: data.reviewerName || (publishing ? ctx.name : null),
    reviewedAt: publishing ? now : null,
  });
  revalidate(publishing ? slug : undefined);
  return { ok: true, slug };
}

export async function updateArticleAction(id: string, form: FormData): Promise<Result> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return ctx;
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: "Invalid article id." };
  const parsed = parseForm(form);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  await dbConnect();
  const doc = await (Article as unknown as Loose).findById(id);
  if (!doc) return { ok: false, error: "Article not found." };

  const slug = data.slug && data.slug.length ? data.slug : toSlug(data.title);
  if (!slug) return { ok: false, error: "Couldn't derive a slug." };
  const clash = await (Article as unknown as Loose).findOne({ slug });
  if (clash && String((clash as { _id: unknown })._id) !== id) {
    return { ok: false, error: "Another article already uses this slug." };
  }

  const wasPublished = doc.status === "published";
  doc.title = data.title;
  doc.slug = slug;
  doc.excerpt = data.excerpt ?? "";
  doc.body = data.body;
  doc.coverImageUrl = data.coverImageUrl || null;
  doc.titleBn = data.titleBn || null;
  doc.excerptBn = data.excerptBn ?? "";
  doc.bodyBn = data.bodyBn || null;
  doc.specialties = data.specialties ?? [];
  doc.keyFacts = data.keyFacts ?? [];
  doc.keyFactsBn = data.keyFactsBn ?? [];
  doc.citations = (data.citations ?? []).map((c) => ({
    label: c.label,
    url: c.url,
    publisher: c.publisher || null,
  }));
  if (data.authorName) doc.authorName = data.authorName;
  // Reviewer fields are editable directly (the reviewing clinician may differ
  // from the publishing admin). A blank reviewerName leaves the existing one.
  if (data.reviewerName) doc.reviewerName = data.reviewerName;
  doc.reviewerCredential = data.reviewerCredential || null;
  doc.reviewerProfileUrl = data.reviewerProfileUrl || null;
  doc.status = data.status;
  if (data.status === "published" && !wasPublished) {
    doc.publishedAt = (doc.publishedAt as Date | null) ?? new Date();
    doc.reviewedBy = ctx.id;
    if (!doc.reviewerName) doc.reviewerName = ctx.name;
    doc.reviewedAt = new Date();
  }
  await doc.save();
  revalidate(slug);
  return { ok: true, slug };
}

/** Quick status change from the admin list (publish / unpublish / approve a submission). */
export async function setArticleStatusAction(id: string, status: ArticleStatus): Promise<Result> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return ctx;
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: "Invalid article id." };
  if (!ARTICLE_STATUSES.includes(status)) return { ok: false, error: "Invalid status." };

  await dbConnect();
  const doc = await (Article as unknown as Loose).findById(id);
  if (!doc) return { ok: false, error: "Article not found." };

  doc.status = status;
  if (status === "published") {
    doc.publishedAt = (doc.publishedAt as Date | null) ?? new Date();
    doc.reviewedBy = ctx.id;
    doc.reviewerName = ctx.name;
    doc.reviewedAt = new Date();
  }
  await doc.save();
  revalidate(doc.slug as string);
  return { ok: true, slug: doc.slug as string };
}

export async function deleteArticleAction(id: string): Promise<Result> {
  const ctx = await requireAdmin();
  if (!ctx.ok) return ctx;
  if (!Types.ObjectId.isValid(id)) return { ok: false, error: "Invalid article id." };
  await dbConnect();
  await (Article as unknown as Loose).deleteOne({ _id: id });
  revalidate();
  return { ok: true };
}
