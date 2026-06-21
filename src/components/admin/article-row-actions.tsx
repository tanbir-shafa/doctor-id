"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setArticleStatusAction, deleteArticleAction } from "@/server/actions/article";

export function ArticleRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const publish = () =>
    start(async () => {
      await setArticleStatusAction(id, status === "published" ? "draft" : "published");
      router.refresh();
    });

  const remove = () => {
    if (!window.confirm("Delete this article permanently?")) return;
    start(async () => {
      await deleteArticleAction(id);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-3 text-xs">
      <Link href={`/admin/articles/${id}/edit`} className="font-medium text-primary hover:underline">
        Edit
      </Link>
      <button
        type="button"
        onClick={publish}
        disabled={pending}
        className="font-medium text-foreground hover:underline disabled:opacity-50"
      >
        {status === "published" ? "Unpublish" : "Publish"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="font-medium text-rose-600 hover:underline disabled:opacity-50"
      >
        Delete
      </button>
    </div>
  );
}
