"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createArticleAction, updateArticleAction } from "@/server/actions/article";

interface Initial {
  title?: string;
  slug?: string;
  excerpt?: string;
  body?: string;
  coverImageUrl?: string | null;
  specialties?: string[];
  authorName?: string;
  status?: string;
  titleBn?: string | null;
  excerptBn?: string;
  bodyBn?: string | null;
}

const FIELD = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground";
const LABEL = "block text-sm font-medium text-foreground";

export function ArticleForm({ articleId, initial }: { articleId?: string; initial?: Initial }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    start(async () => {
      const res = articleId ? await updateArticleAction(articleId, form) : await createArticleAction(form);
      if (res.ok) router.push("/admin/articles");
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
      {error ? (
        <p className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>
      ) : null}

      <div className="space-y-1">
        <label className={LABEL} htmlFor="title">Title</label>
        <input id="title" name="title" required defaultValue={initial?.title} className={FIELD} />
      </div>

      <div className="space-y-1">
        <label className={LABEL} htmlFor="slug">Slug</label>
        <input
          id="slug"
          name="slug"
          defaultValue={initial?.slug}
          placeholder="auto from title if blank — e.g. high-blood-pressure-symptoms"
          className={FIELD}
        />
        <p className="text-xs text-muted-foreground">Lowercase letters, numbers and hyphens. The public URL is /guides/&lt;slug&gt;.</p>
      </div>

      <div className="space-y-1">
        <label className={LABEL} htmlFor="excerpt">Excerpt</label>
        <textarea id="excerpt" name="excerpt" rows={2} defaultValue={initial?.excerpt} className={FIELD} />
        <p className="text-xs text-muted-foreground">Short summary for cards + search results (≤320 chars).</p>
      </div>

      <div className="space-y-1">
        <label className={LABEL} htmlFor="body">Body (Markdown)</label>
        <textarea id="body" name="body" rows={16} required defaultValue={initial?.body} className={`${FIELD} font-mono`} />
        <p className="text-xs text-muted-foreground">Markdown: ## headings, **bold**, lists, [links](url). HTML is sanitized out.</p>
      </div>

      <div className="space-y-1">
        <label className={LABEL} htmlFor="specialties">Related specialties</label>
        <input
          id="specialties"
          name="specialties"
          defaultValue={initial?.specialties?.join(", ")}
          placeholder="Cardiology, Medicine"
          className={FIELD}
        />
        <p className="text-xs text-muted-foreground">Comma-separated — used to link the guide to specialty hubs.</p>
      </div>

      <div className="space-y-1">
        <label className={LABEL} htmlFor="authorName">Author byline</label>
        <input id="authorName" name="authorName" defaultValue={initial?.authorName} placeholder="Daktar.Link Editorial" className={FIELD} />
      </div>

      <div className="space-y-1">
        <label className={LABEL} htmlFor="coverImageUrl">Cover image URL (optional)</label>
        <input id="coverImageUrl" name="coverImageUrl" defaultValue={initial?.coverImageUrl ?? ""} className={FIELD} />
      </div>

      <fieldset className="space-y-4 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-foreground">Bangla version (optional)</legend>
        <p className="text-xs text-muted-foreground">
          Fill the body to publish a Bangla version at /bn/guides/&lt;slug&gt; (same slug, paired to the
          English page via hreflang). Leave blank for English-only.
        </p>
        <div className="space-y-1">
          <label className={LABEL} htmlFor="titleBn">Title (Bangla)</label>
          <input id="titleBn" name="titleBn" defaultValue={initial?.titleBn ?? ""} className={FIELD} />
        </div>
        <div className="space-y-1">
          <label className={LABEL} htmlFor="excerptBn">Excerpt (Bangla)</label>
          <textarea id="excerptBn" name="excerptBn" rows={2} defaultValue={initial?.excerptBn} className={FIELD} />
        </div>
        <div className="space-y-1">
          <label className={LABEL} htmlFor="bodyBn">Body — Bangla (Markdown)</label>
          <textarea id="bodyBn" name="bodyBn" rows={12} defaultValue={initial?.bodyBn ?? ""} className={`${FIELD} font-mono`} />
        </div>
      </fieldset>

      <div className="space-y-1">
        <label className={LABEL} htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={initial?.status ?? "draft"} className={FIELD}>
          <option value="draft">Draft</option>
          <option value="pending_review">Pending review</option>
          <option value="published">Published</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : articleId ? "Save changes" : "Create article"}
        </button>
        <button type="button" onClick={() => router.push("/admin/articles")} className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
    </form>
  );
}
