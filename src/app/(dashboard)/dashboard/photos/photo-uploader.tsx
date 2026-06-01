"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { presignProfileUpload, confirmProfilePhoto } from "@/server/actions/photo";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

type PresignResult =
  | { ok: true; data?: { uploadUrl: string; publicUrl: string; key: string } }
  | { ok: false; error: string };
type ConfirmResult = { ok: true } | { ok: false; error: string };

type PresignAction = (input: {
  kind: "profile" | "cover" | "verification";
  contentType: string;
  contentLength: number;
}) => Promise<PresignResult>;
type ConfirmAction = (input: {
  kind: "profile" | "cover";
  url: string;
  key: string;
}) => Promise<ConfirmResult>;

/**
 * Presigned-PUT photo uploader.
 *
 * Skips the react-easy-crop cropper for MVP — Step 7 polish adds it. The
 * server's content-type + content-length validation in presignProfileUpload
 * keeps the upload safe even without client-side cropping.
 */
export function PhotoUploader({
  kind,
  currentUrl,
  presignAction,
  confirmAction,
}: {
  kind: "profile" | "cover";
  currentUrl: string | null;
  presignAction?: PresignAction;
  confirmAction?: ConfirmAction;
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
      const presign = presignAction ?? presignProfileUpload;
      const confirm = confirmAction ?? confirmProfilePhoto;

      const presigned = await presign({
        kind,
        contentType: file.type,
        contentLength: file.size,
      });
      if (!presigned.ok || !presigned.data) {
        setError(!presigned.ok ? presigned.error : "Failed to prepare upload");
        return;
      }

      const put = await fetch(presigned.data.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) {
        setError(`Upload failed (HTTP ${put.status}). Try again.`);
        return;
      }

      const confirmed = await confirm({
        kind,
        url: presigned.data.publicUrl,
        key: presigned.data.key,
      });
      if (!confirmed.ok) {
        setError(confirmed.error);
        return;
      }
      setPreviewUrl(presigned.data.publicUrl);
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
