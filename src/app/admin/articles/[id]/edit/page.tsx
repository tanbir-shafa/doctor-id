import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { ArticleForm } from "@/components/admin/article-form";
import { getArticleById } from "@/lib/db/queries/articles";

export const metadata: Metadata = { title: "Admin · Edit article" };
export const dynamic = "force-dynamic";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await getArticleById(id);
  if (!a) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit article"
        breadcrumb={[{ label: "Articles", href: "/admin/articles" }, { label: a.title }]}
      />
      <ArticleForm
        articleId={a._id}
        initial={{
          title: a.title,
          slug: a.slug,
          excerpt: a.excerpt,
          body: a.body,
          coverImageUrl: a.coverImageUrl,
          specialties: a.specialties,
          authorName: a.authorName,
          status: a.status,
          titleBn: a.titleBn,
          excerptBn: a.excerptBn,
          bodyBn: a.bodyBn,
        }}
      />
    </div>
  );
}
