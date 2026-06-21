import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ArticleRowActions } from "@/components/admin/article-row-actions";
import { listArticlesForAdmin } from "@/lib/db/queries/articles";

export const metadata: Metadata = { title: "Admin · Articles" };
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  published: "bg-green-100 text-green-800",
  pending_review: "bg-amber-100 text-amber-800",
  draft: "bg-slate-100 text-slate-700",
};

export default async function AdminArticlesPage() {
  const articles = await listArticlesForAdmin();
  const pending = articles.filter((a) => a.status === "pending_review").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Articles"
        description={`${articles.length} article${articles.length === 1 ? "" : "s"}${pending ? ` · ${pending} awaiting review` : ""}.`}
        breadcrumb={[{ label: "Articles" }]}
        toolbar={
          <Link
            href="/admin/articles/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            + New article
          </Link>
        }
      />

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {articles.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No articles yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Author</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {articles.map((a) => (
                  <tr key={a._id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium text-foreground">
                      {a.title}
                      <span className="block text-xs font-normal text-muted-foreground">/guides/{a.slug}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[a.status] ?? ""}`}>
                        {a.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{a.authorName}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(a.updatedAt).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-4 py-2">
                      <ArticleRowActions id={a._id} status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
