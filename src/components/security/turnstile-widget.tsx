"use client";

/**
 * Cloudflare Turnstile widget (explicit render).
 *
 * Drop this into any form whose Server Action is Turnstile-gated. It:
 *   - renders a hidden `<input name="turnstileToken">` so FormData-based forms
 *     submit the token automatically, AND
 *   - calls `onToken(token)` so object-action forms can stash it in state.
 *
 * When `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset (dev), it renders nothing and
 * never produces a token — the server's verifyTurnstile() no-ops to "pass" in
 * dev, so local flows keep working. In production the key is set, the widget
 * renders, and the server fails closed without a valid token.
 *
 * Use `turnstileEnabled` to conditionally require a token in form UX.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { publicEnv } from "@/lib/env";

export const turnstileEnabled = Boolean(publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      "timeout-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
      size?: "normal" | "flexible" | "compact";
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.turnstile) return resolve();
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile script failed")));
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile script failed"));
    document.head.appendChild(s);
  });
}

export function TurnstileWidget({
  onToken,
  className,
  resetSignal,
}: {
  onToken?: (token: string) => void;
  className?: string;
  /** Bump this (e.g. after each submit attempt) to re-arm the single-use token. */
  resetSignal?: number;
}) {
  const siteKey = publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState("");

  const emit = useCallback(
    (t: string) => {
      setToken(t);
      onToken?.(t);
    },
    [onToken],
  );

  // Turnstile tokens are single-use; once the server consumes one, a retry needs
  // a fresh token. Resetting clears the stale one and re-challenges.
  useEffect(() => {
    if (resetSignal === undefined || !widgetIdRef.current || !window.turnstile) return;
    try {
      window.turnstile.reset(widgetIdRef.current);
    } catch {
      /* ignore */
    }
    emit("");
  }, [resetSignal, emit]);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (t) => emit(t),
          "error-callback": () => emit(""),
          "expired-callback": () => emit(""),
          "timeout-callback": () => emit(""),
          theme: "auto",
        });
      })
      .catch(() => {
        // Script blocked / offline — leave token empty; server decides.
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, emit]);

  if (!siteKey) return null;

  return (
    <div className={className}>
      <div ref={containerRef} />
      <input type="hidden" name="turnstileToken" value={token} />
    </div>
  );
}
