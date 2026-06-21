import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedBnArticles } from "@/lib/db/queries/articles";
import { buildBreadcrumbJsonLd, pruneJsonLd } from "@/lib/seo/jsonld";
import { hreflangAlternates } from "@/lib/i18n/config";
import { publicEnv } from "@/lib/env";

export const revalidate = 300;

const BASE = publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

export const metadata: Metadata = {
  title: "স্বাস্থ্য গাইড",
  description:
    "Daktar.Link-এর সহজ ভাষার স্বাস্থ্য গাইড — সাধারণ উপসর্গ ও রোগ সম্পর্কে জানুন, এবং কখন ডাক্তার দেখানো প্রয়োজন বুঝুন।",
  alternates: { canonical: `${BASE}/bn/guides`, languages: hreflangAlternates("/guides") },
};

export default async function BnGuidesPage() {
  const articles = await listPublishedBnArticles();
  const breadcrumbLd = pruneJsonLd(
    buildBreadcrumbJsonLd([
      { name: "হোম", url: `${BASE}/` },
      { name: "স্বাস্থ্য গাইড", url: `${BASE}/bn/guides` },
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
          <div className="mb-3">
            <Link
              href="/guides"
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
            >
              English
            </Link>
          </div>
          <p className="text-sm font-medium uppercase tracking-wider text-primary">স্বাস্থ্য গাইড</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            স্বাস্থ্য গাইড
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            সহজ ভাষায় নির্ভরযোগ্য স্বাস্থ্য তথ্য — সাধারণ উপসর্গ ও রোগ বুঝতে এবং কখন ডাক্তার দেখাবেন তা
            ঠিক করতে সাহায্য করে। প্রতিটি গাইড Daktar.Link টিম লিখেছে ও যাচাই করেছে।
          </p>
        </header>

        {articles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
            নতুন গাইড শীঘ্রই আসছে — একটু পরে আবার দেখুন।
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {articles.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/bn/guides/${a.slug}`}
                  className="block h-full rounded-xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm"
                >
                  <h2 className="font-semibold text-foreground">{a.titleBn || a.title}</h2>
                  {a.excerptBn || a.excerpt ? (
                    <p className="mt-1.5 text-sm text-muted-foreground">{a.excerptBn || a.excerpt}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
