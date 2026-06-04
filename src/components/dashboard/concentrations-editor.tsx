"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProfileConcentrationsAction } from "@/server/actions/doctor";

type SubmitResult = { ok: true } | { ok: false; error: string };
type SubmitAction = (form: FormData) => Promise<SubmitResult>;

const MAX_TAGS = 30;
const MAX_LEN = 80;

/**
 * "Areas of focus" editor — free-form concentration tags shown on the public
 * profile. Type + Enter (or comma) to add, click ✕ to remove. The list is
 * replaced wholesale on save, same contract as the specialties editor.
 *
 * Accepts an optional `submitAction` so the admin section wrapper can bind the
 * admin action; defaults to the doctor's own action.
 */
export function ConcentrationsEditor({
  initial = [],
  submitAction,
}: {
  initial?: string[];
  submitAction?: SubmitAction;
}) {
  const [tags, setTags] = useState<string[]>(() => dedupe(initial));
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const atMax = tags.length >= MAX_TAGS;

  function addTag(raw: string) {
    const value = raw.trim().slice(0, MAX_LEN);
    if (!value) return;
    setTags((prev) => {
      if (prev.length >= MAX_TAGS) return prev;
      if (prev.some((t) => t.toLowerCase() === value.toLowerCase())) return prev;
      return [...prev, value];
    });
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && !draft && tags.length) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  function save() {
    setMsg(null);
    // Fold any in-progress draft into the payload so a typed-but-not-entered
    // tag isn't silently dropped on save.
    const payload = dedupe([...tags, draft]);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("concentrations", JSON.stringify(payload));
      const action = submitAction ?? updateProfileConcentrationsAction;
      const r = await action(fd);
      if (r.ok) {
        setTags(payload);
        setDraft("");
        setMsg({ tone: "ok", text: "Saved." });
      } else {
        setMsg({ tone: "err", text: r.error });
      }
    });
  }

  return (
    <div className="space-y-3">
      {tags.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((t, idx) => (
            <li
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs text-foreground"
            >
              {t}
              <button
                type="button"
                onClick={() => setTags((prev) => prev.filter((_, i) => i !== idx))}
                aria-label={`Remove ${t}`}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No areas of focus yet.</p>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={atMax}
        placeholder={atMax ? "Maximum 30 reached" : "Type and press Enter (e.g. Interventional Cardiology)"}
        aria-label="Add an area of focus"
      />
      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save areas of focus"}
        </Button>
        {msg ? (
          <p className={msg.tone === "ok" ? "text-sm text-green-600" : "text-sm text-destructive"}>
            {msg.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values ?? []) {
    const v = raw.trim();
    const key = v.toLowerCase();
    if (v && !seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}
