"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadProfilePhotoAction } from "@/server/actions/photo";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

type UploadResult = { ok: true; data?: { url: string } } | { ok: false; error: string };
type UploadAction = (formData: FormData) => Promise<UploadResult>;

/**
 * Photo uploader. POSTs the file to a server action that uploads to S3 and
 * writes the File doc + Doctor.photo cache. The dashboard uses the default
 * action; the admin section passes its own `uploadAction`. Skips the
 * react-easy-crop cropper for MVP.
 */
export function PhotoUploader({
  kind,
  currentUrl,
  uploadAction,
}: {
  kind: "profile" | "cover";
  currentUrl: string | null;
  uploadAction?: UploadAction;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!ALLOWED.includes(file.type)) {
      setError("Pick a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("File is larger than 5 MB.");
      return;
    }

    // Local preview before the upload completes
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    startTransition(async () => {
      // One POST; the file streams server-side to S3 (File doc + cache written there).
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", file);
      const action = uploadAction ?? uploadProfilePhotoAction;
      const res = await action(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data?.url) setPreviewUrl(res.data.url);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className={kind === "cover" ? "h-24 w-48 overflow-hidden rounded-md border border-border bg-muted" : "size-24 overflow-hidden rounded-md border border-border bg-muted"}>
          {previewUrl ? (
            <Image src={previewUrl} alt="" width={kind === "cover" ? 192 : 96} height={96} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
              No image
            </div>
          )}
        </div>
        <div>
          <Button type="button" variant="outline" onClick={() => ref.current?.click()} disabled={pending}>
            <Upload className="size-4" aria-hidden="true" />
            {pending ? "Uploading…" : "Choose file"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">JPG, PNG, or WebP. Max 5 MB.</p>
        </div>
        <input
          ref={ref}
          type="file"
          accept={ALLOWED.join(",")}
          className="sr-only"
          onChange={handleSelect}
        />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
