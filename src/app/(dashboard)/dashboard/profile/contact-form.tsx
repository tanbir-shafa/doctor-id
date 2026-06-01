"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updateProfileContactAction } from "@/server/actions/doctor";
import type { DoctorDocLike } from "@/types/doctor";

type SubmitResult = { ok: true } | { ok: false; error: string };
type SubmitAction = (form: FormData) => Promise<SubmitResult>;

export function ContactSectionForm({
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
      const action = submitAction ?? updateProfileContactAction;
      const r = await action(form);
      setMsg(r.ok ? { tone: "ok", text: "Saved." } : { tone: "err", text: r.error });
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="publicPhone">Public phone</Label>
        <Input id="publicPhone" name="publicPhone" defaultValue={doctor.contact.publicPhone ?? ""} placeholder="+8801XXXXXXXXX" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="whatsapp">WhatsApp</Label>
        <Input id="whatsapp" name="whatsapp" defaultValue={doctor.contact.whatsapp ?? ""} placeholder="+8801XXXXXXXXX" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="publicEmail">Public email</Label>
        <Input id="publicEmail" name="publicEmail" type="email" defaultValue={doctor.contact.publicEmail ?? ""} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="website">Website</Label>
        <Input id="website" name="website" type="url" defaultValue={doctor.contact.website ?? ""} placeholder="https://" />
      </div>
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="text-sm font-medium">Privacy</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="privacyHidePhone" defaultChecked={doctor.privacyHidePhone} className="size-4" />
          Hide phone & WhatsApp on public profile
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="privacyHideEmail" defaultChecked={doctor.privacyHideEmail} className="size-4" />
          Hide email on public profile
        </label>
      </fieldset>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save contact"}</Button>
        {msg ? (
          <p className={msg.tone === "ok" ? "text-sm text-green-600" : "text-sm text-destructive"}>{msg.text}</p>
        ) : null}
      </div>
    </form>
  );
}
