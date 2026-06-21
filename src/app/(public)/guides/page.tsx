import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedArticles } from "@/lib/db/queries/articles";
import { buildBreadcrumbJsonLd, pruneJsonLd } from "@/lib/seo/jsonld";
import { publicEnv } from "@/lib/env";

export const revalidate = 300;

const BASE = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Health guides",
  description:
    "Clear, patient-friendly health guides from Daktar.Link — understand symptoms and conditions, and know when to see a doctor in Bangladesh.",
  alternates: { canonical: `${BASE}/guides` },
};

export default async function GuidesPage() {
  const articles = await listPublishedArticles();
  const breadcrumbLd = pruneJsonLd(
    buildBreadcrumbJsonLd([
      { name: "Home", url: `${BASE}/` },
      { name: "Health guides", url: `${BASE}/guides` },
    ]),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <section className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-sm font-medium uppercase tracking-wider text-primary">Health guides</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Health guides
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Plain-language health information to help you understand common symptoms and conditions —
            and decide when it&apos;s time to see a doctor. Each guide is written and reviewed by the
            Daktar.Link team.
          </p>
        </header>

        {articles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            New guides are on the way — check back soon.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {articles.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/guides/${a.slug}`}
                  className="block h-full rounded-xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm"
                >
                  <h2 className="font-semibold text-foreground">{a.title}</h2>
                  {a.excerpt ? (
                    <p className="mt-1.5 text-sm text-muted-foreground">{a.excerpt}</p>
                  ) : null}
                  <span className="mt-3 block text-xs text-muted-foreground">By {a.authorName}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
