import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { ArticleForm } from "@/components/admin/article-form";

export const metadata: Metadata = { title: "Admin · New article" };
export const dynamic = "force-dynamic";

export default function NewArticlePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="New article"
        breadcrumb={[{ label: "Articles", href: "/admin/articles" }, { label: "New" }]}
      />
      <ArticleForm />
    </div>
  );
}
