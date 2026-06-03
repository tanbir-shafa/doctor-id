"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadRegistrationSelfieAction } from "@/server/actions/photo";

export interface SelfieData {
  key: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
}

type Status = "idle" | "requesting" | "streaming" | "captured" | "uploading" | "uploaded" | "error";
type ErrorKind =
  | "permission-denied"
  | "no-camera"
  | "unsupported"
  | "insecure-context"
  | "capture-failed"
  | "upload-failed";

const ERROR_COPY: Record<ErrorKind, string> = {
  "permission-denied":
    "Camera permission was denied. Enable it in your browser's address bar, then try again.",
  "no-camera":
    "No camera detected. Registration requires a device with a camera — try your phone.",
  unsupported:
    "Your browser doesn't support camera capture. Try a recent Chrome, Safari, or Edge.",
  "insecure-context":
    "The camera needs a secure connection. Open this page over HTTPS (or on localhost).",
  "capture-failed": "Couldn't capture the photo. Try again.",
  "upload-failed": "Upload failed. Check your connection and try again.",
};

/**
 * Mandatory live-selfie capture (no gallery upload by design).
 *
 * getUserMedia → live <video> → freeze a frame to <canvas> → JPEG blob. The
 * blob is only uploaded on an explicit "Use this photo" click (so retakes
 * don't burn the IP-rate-limited upload). The camera stream is stopped the
 * moment a frame is captured and on unmount. The parent gates "Continue" on
 * the returned key.
 */
export function SelfieCapture({
  onCaptured,
  onCleared,
  disabled,
}: {
  onCaptured: (data: SelfieData) => void;
  onCleared: () => void;
  disabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [errorKind, setErrorKind] = useState<ErrorKind | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function clearPreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    blobRef.current = null;
    setPreviewUrl(null);
  }

  // Stop the camera + free the object URL on unmount (kills the camera light).
  useEffect(() => {
    return () => {
      stopStream();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function openCamera() {
    setErrorKind(null);
    setErrorDetail(null);
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setErrorKind("insecure-context");
      setStatus("error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorKind("unsupported");
      setStatus("error");
      return;
    }
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setStatus("streaming");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setErrorKind("permission-denied");
      } else if (
        name === "NotFoundError" ||
        name === "DevicesNotFoundError" ||
        name === "OverconstrainedError"
      ) {
        setErrorKind("no-camera");
      } else {
        setErrorKind("unsupported");
      }
      setStatus("error");
    }
  }

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setErrorKind("capture-failed");
      setStatus("error");
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErrorKind("capture-failed");
          setStatus("error");
          return;
        }
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setPreviewUrl(url);
        stopStream();
        setStatus("captured");
      },
      "image/jpeg",
      0.9,
    );
  }

  function retake() {
    clearPreview();
    onCleared();
    void openCamera();
  }

  async function usePhoto() {
    if (!blobRef.current) return;
    setStatus("uploading");
    setErrorKind(null);
    setErrorDetail(null);
    try {
      const fd = new FormData();
      fd.set("file", new File([blobRef.current], "selfie.jpg", { type: "image/jpeg" }));
      const res = await uploadRegistrationSelfieAction(fd);
      if (!res.ok) {
        setErrorKind("upload-failed");
        setErrorDetail(res.error);
        setStatus("captured"); // keep the still so the user can retry
        return;
      }
      if (res.data) onCaptured(res.data);
      setStatus("uploaded");
    } catch {
      setErrorKind("upload-failed");
      setStatus("captured");
    }
  }

  const showVideo = status === "streaming" || status === "requesting";
  const showPreview =
    previewUrl !== null && (status === "captured" || status === "uploading" || status === "uploaded");

  return (
    <div className="space-y-2">
      <div className="relative flex aspect-square w-40 items-center justify-center overflow-hidden rounded-md border border-input bg-muted">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={showVideo ? "size-full object-cover" : "hidden"}
        />
        {showPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl ?? ""} alt="Selfie preview" className="size-full object-cover" />
        ) : null}
        {!showVideo && !showPreview ? (
          <Camera className="size-8 text-muted-foreground" aria-hidden="true" />
        ) : null}
        {status === "uploaded" ? (
          <span className="absolute right-1 top-1 rounded-full bg-emerald-600 p-1 text-white">
            <Check className="size-3.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="flex flex-wrap items-center gap-2">
        {(status === "idle" || status === "error") && (
          <Button type="button" variant="outline" size="sm" onClick={openCamera} disabled={disabled}>
            <Camera className="size-4" aria-hidden="true" />
            {status === "error" ? "Try again" : "Open camera"}
          </Button>
        )}
        {status === "requesting" && (
          <span className="text-xs text-muted-foreground">Requesting camera…</span>
        )}
        {status === "streaming" && (
          <Button type="button" size="sm" onClick={capture} disabled={disabled}>
            <Camera className="size-4" aria-hidden="true" /> Capture
          </Button>
        )}
        {status === "captured" && (
          <Button type="button" size="sm" onClick={usePhoto} disabled={disabled}>
            <Check className="size-4" aria-hidden="true" /> Use this photo
          </Button>
        )}
        {status === "uploading" && (
          <span className="text-xs text-muted-foreground">Uploading…</span>
        )}
        {(status === "captured" || status === "uploaded") && (
          <Button type="button" variant="outline" size="sm" onClick={retake} disabled={disabled}>
            <RefreshCw className="size-4" aria-hidden="true" /> Retake
          </Button>
        )}
        {status === "uploaded" && <span className="text-xs text-emerald-600">Selfie saved.</span>}
      </div>

      {errorKind ? (
        <p role="alert" className="text-xs text-destructive">
          {errorDetail ?? ERROR_COPY[errorKind]}
        </p>
      ) : null}
    </div>
  );
}
