"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight modal built on the native HTML `<dialog>` element.
 *
 * The browser handles the focus trap, top-layer stacking, ESC-to-close, and
 * inert background automatically — we don't pull in Radix / Headless UI for
 * one modal. Backdrop click closes via the `::backdrop` pseudo-element +
 * a click-on-self handler.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  // Sync the controlled `open` prop into the native dialog. `showModal()` /
  // `close()` are idempotent — calling them on a dialog already in that state
  // is a no-op, so this stays cheap.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // Mirror native close (ESC, form method=dialog) back into React state.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClose = () => onOpenChange(false);
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, [onOpenChange]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget) {
      onOpenChange(false);
    }
  }

  return (
    <dialog
      ref={ref}
      onClick={handleBackdropClick}
      className={cn(
        // Override the native dialog's default top-aligned positioning so the
        // modal sits in the middle of the viewport. `inset: 0 + margin: auto`
        // works in every browser that supports the dialog element.
        "fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-slate-900/50",
        "open:animate-in open:fade-in",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0 space-y-0.5">
          {title ? <h2 className="text-lg font-semibold text-foreground">{title}</h2> : null}
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
    </dialog>
  );
}
