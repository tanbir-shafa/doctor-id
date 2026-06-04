"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Free-form sub-specialty tag input that lives *inside* the uncontrolled
 * Basic-info <form> (basic-form.tsx). It renders one hidden
 * `<input name="subSpecialties">` per tag, so the parent form's FormData submit
 * carries them via `getAll("subSpecialties")` — the same mechanism the
 * Languages checkboxes already rely on. This control has no save button of its
 * own; the parent form's "Save basic info" button submits everything together.
 *
 * The draft <Input> deliberately has no `name`, so an unsubmitted draft is not
 * captured by FormData.
 */
const MAX_TAGS = 10;
const MAX_LEN = 80;

export function SubSpecialtiesInput({
  initial = [],
  name = "subSpecialties",
  id = "subspecialty-input",
}: {
  initial?: string[];
  name?: string;
  id?: string;
}) {
  const [tags, setTags] = useState<string[]>(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of initial ?? []) {
      const v = raw.trim();
      const key = v.toLowerCase();
      if (v && !seen.has(key)) {
        seen.add(key);
        out.push(v);
      }
    }
    return out;
  });
  const [draft, setDraft] = useState("");

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

  function remove(idx: number) {
    setTags((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {/* These hidden inputs are what FormData / getAll(name) collect on submit. */}
      {tags.map((t) => (
        <input key={t} type="hidden" name={name} value={t} />
      ))}
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
                onClick={() => remove(idx)}
                aria-label={`Remove ${t}`}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => addTag(draft)}
        disabled={atMax}
        placeholder={atMax ? "Maximum 10 reached" : "Type and press Enter (e.g. Echocardiography)"}
        aria-label="Add a sub-specialty"
      />
    </div>
  );
}
