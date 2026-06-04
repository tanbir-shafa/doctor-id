"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateProfileBasicAction } from "@/server/actions/doctor";
import { SubSpecialtiesInput } from "@/components/dashboard/sub-specialties-input";
import type { DoctorDocLike } from "@/types/doctor";

const ALL_LANGS = ["Bangla", "English", "Hindi", "Urdu", "Arabic"];

type SubmitResult = { ok: true } | { ok: false; error: string };
type SubmitAction = (form: FormData) => Promise<SubmitResult>;

export function BasicSectionForm({
  doctor,
  submitAction,
}: {
  doctor: DoctorDocLike;
  submitAction?: SubmitAction;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setMsg(null);
    startTransition(async () => {
      const action = submitAction ?? updateProfileBasicAction;
      const r = await action(form);
      setMsg(r.ok ? { tone: "ok", text: "Saved." } : { tone: "err", text: r.error });
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="displayName">Public display name</Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={doctor.name.displayName}
          required
          placeholder="e.g. Prof. Dr. Md Nur Alam Lelin"
        />
        <p className="text-xs text-muted-foreground">
          This is rendered exactly as typed on the public profile, search results,
          OG/SEO tags, the Rx pad, and the QR card. Include the title — &ldquo;Dr.&rdquo;,
          &ldquo;Prof. Dr.&rdquo;, etc.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="prefix">Title (sort &amp; filter only)</Label>
        <select
          id="prefix"
          name="prefix"
          defaultValue={doctor.name.prefix}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {["Dr.", "Prof. Dr.", "Asst. Prof. Dr.", "Assoc. Prof. Dr."].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Auxiliary — used for sorting and filtering directory listings. Not
          shown to patients; edit the display name above to change what they see.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="firstName">First name</Label>
        <Input id="firstName" name="firstName" defaultValue={doctor.name.first} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lastName">Last name</Label>
        <Input id="lastName" name="lastName" defaultValue={doctor.name.last} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gender">Gender</Label>
        <select
          id="gender"
          name="gender"
          defaultValue={doctor.gender ?? "prefer_not_to_say"}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="prefer_not_to_say">Prefer not to say</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Languages</legend>
        <div className="flex flex-wrap gap-3">
          {ALL_LANGS.map((l) => (
            <label key={l} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="languages"
                value={l}
                defaultChecked={(doctor.languages ?? []).includes(l)}
                className="size-4"
              />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="subspecialty-input">Sub-specialties</Label>
        <SubSpecialtiesInput id="subspecialty-input" initial={doctor.subSpecialties ?? []} />
        <p className="text-xs text-muted-foreground">
          Focused areas within your specialty — e.g. Echocardiography,
          Interventional Cardiology. Press Enter to add each (max 10). Used in
          search.
        </p>
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="bio">Bio (markdown supported, max 2000 chars)</Label>
        <textarea
          id="bio"
          name="bio"
          rows={5}
          maxLength={2000}
          defaultValue={doctor.bio ?? ""}
          className="w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save basic info"}</Button>
        {msg ? (
          <p className={msg.tone === "ok" ? "text-sm text-green-600" : "text-sm text-destructive"}>{msg.text}</p>
        ) : null}
      </div>
    </form>
  );
}
