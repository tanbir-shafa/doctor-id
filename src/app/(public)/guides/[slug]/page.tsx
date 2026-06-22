import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedArticleBySlug } from "@/lib/db/queries/articles";
import { findSpecialtySlugByName } from "@/lib/db/queries/doctors";
import { renderBioMarkdown } from "@/lib/utils/sanitize";
import { buildArticleJsonLd, buildBreadcrumbJsonLd, pruneJsonLd } from "@/lib/seo/jsonld";
import { hreflangAlternates } from "@/lib/i18n/config";
import { publicEnv } from "@/lib/env";

export const revalidate = 300;
export const dynamicParams = true;

const BASE = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = await getPublishedArticleBySlug(slug);
  if (!a) return { title: "Not found" };
  const hasBn = Boolean(a.bodyBn && a.bodyBn.trim());
  return {
    title: a.seoTitle || a.title,
    description: a.seoDescription || a.excerpt || undefined,
    alternates: {
      canonical: `${BASE}/guides/${a.slug}`,
      ...(hasBn ? { languages: hreflangAlternates(`/guides/${a.slug}`) } : {}),
    },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await getPublishedArticleBySlug(slug);
  if (!a) notFound();

  const html = renderBioMarkdown(a.body);

  // Internal-link automation: link the article's specialty tags to their hubs.
  const related = (
    await Promise.all(
      (a.specialties ?? []).slice(0, 6).map(async (name) => {
        const sslug = await findSpecialtySlugByName(name);
        return sslug ? { name, href: `/${sslug}` } : null;
      }),
    )
  ).filter(Boolean) as { name: string; href: string }[];

  const published = a.publishedAt ? new Date(a.publishedAt) : null;
  const reviewed = a.reviewedAt ? new Date(a.reviewedAt) : null;
  const keyFacts = a.keyFacts ?? [];
  const citations = a.citations ?? [];
  const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const articleLd = pruneJsonLd(
    buildArticleJsonLd({
      title: a.title,
      slug: a.slug,
      excerpt: a.excerpt,
      coverImageUrl: a.coverImageUrl,
      authorName: a.authorName,
      publishedAt: a.publishedAt,
      updatedAt: a.updatedAt,
      reviewerName: a.reviewerName,
      reviewerCredential: a.reviewerCredential,
      reviewerProfileUrl: a.reviewerProfileUrl,
      reviewedAt: a.reviewedAt,
      citations,
      specialties: a.specialties,
    }),
  );
  const breadcrumbLd = pruneJsonLd(
    buildBreadcrumbJsonLd([
      { name: "Home", url: `${BASE}/` },
      { name: "Health guides", url: `${BASE}/guides` },
      { name: a.title, url: `${BASE}/guides/${a.slug}` },
    ]),
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/guides" className="text-sm font-medium text-primary hover:underline">
            ← All health guides
          </Link>
          {a.bodyBn && a.bodyBn.trim() ? (
            <Link
              href={`/bn/guides/${a.slug}`}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
            >
              বাংলায় পড়ুন
            </Link>
          ) : null}
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {a.title}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          By {a.authorName}
          {a.reviewerName
            ? ` · Medically reviewed by ${a.reviewerName}${a.reviewerCredential ? `, ${a.reviewerCredential}` : ""}`
            : ""}
          {published ? ` · Published ${fmtDate(published)}` : ""}
          {reviewed ? ` · Last reviewed ${fmtDate(reviewed)}` : ""}
        </p>

        {keyFacts.length > 0 ? (
          <section aria-labelledby="key-facts" className="mt-6 rounded-lg border border-border bg-muted/30 p-4">
            <h2 id="key-facts" className="text-sm font-semibold text-foreground">Key facts</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
              {keyFacts.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <div
          className="mt-6 leading-relaxed text-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:mt-1 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mt-4 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {related.length > 0 ? (
          <aside className="mt-10 border-t border-border pt-6">
            <p className="mb-2 text-sm font-medium text-foreground">Find a doctor</p>
            <div className="flex flex-wrap gap-2">
              {related.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="rounded-full border border-border bg-card px-3 py-1 text-sm text-foreground hover:border-primary/40 hover:bg-accent"
                >
                  {r.name} doctors
                </Link>
              ))}
            </div>
          </aside>
        ) : null}

        {citations.length > 0 ? (
          <section aria-labelledby="references" className="mt-10 border-t border-border pt-6">
            <h2 id="references" className="text-sm font-semibold text-foreground">References</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              {citations.map((c, i) => (
                <li key={i}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-primary underline"
                  >
                    {c.label}
                  </a>
                  {c.publisher ? ` — ${c.publisher}` : ""}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <p className="mt-10 rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
          This guide is general health information, not a substitute for professional medical advice,
          diagnosis or treatment. Always consult a qualified doctor about your individual situation. Read about
          how we write and review these guides in our{" "}
          <Link href="/editorial-policy" className="text-primary underline">
            editorial policy
          </Link>
          .
        </p>
      </article>
    </>
  );
}
