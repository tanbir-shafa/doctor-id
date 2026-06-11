"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminCreateDoctorAction } from "@/server/actions/admin-doctor";

const PREFIXES = ["Dr.", "Prof. Dr.", "Asst. Prof. Dr.", "Assoc. Prof. Dr."] as const;

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/**
 * Minimal admin "create doctor" form. Mirrors the EmailLoginForm submit pattern:
 * a transition + `router.push` on success. The action creates an unclaimed draft
 * and returns its slug; we land on the full editor with a ?created=1 banner.
 */
export function CreateDoctorForm({ specialties }: { specialties: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await adminCreateDoctorAction(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/admin/doctors/${result.data?.slug ?? ""}/edit?created=1`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="prefix">Title</Label>
          <select id="prefix" name="prefix" defaultValue="Dr." className={SELECT_CLASS}>
            {PREFIXES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" required maxLength={80} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" required maxLength={80} autoComplete="off" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="primarySpecialty">
            Primary specialty <span className="text-muted-foreground">(optional)</span>
          </Label>
          <select id="primarySpecialty" name="primarySpecialty" defaultValue="" className={SELECT_CLASS}>
            <option value="">— None —</option>
            {specialties.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bmdcNumber">
            BMDC number <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input id="bmdcNumber" name="bmdcNumber" maxLength={20} autoComplete="off" />
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create doctor"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Creates a draft profile, then opens the editor.
        </span>
      </div>
    </form>
  );
}
