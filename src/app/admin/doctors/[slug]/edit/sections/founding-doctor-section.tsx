"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminUpdateFoundingDoctorAction } from "@/server/actions/admin-doctor";

/**
 * Admin-only Founding Doctor override (no referral required). Toggles the gold
 * badge + founding-first search ranking. A revoke overrides the "permanent once
 * awarded" rule — the optional reason is recorded in the audit log.
 */
export function AdminFoundingDoctorSection({
  doctorId,
  initial,
}: {
  doctorId: string;
  initial: {
    isFounding: boolean;
    qualifiedReferrals: number;
    awardedAt: string | Date | null;
  };
}) {
  const [isFounding, setIsFounding] = useState(initial.isFounding);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const fd = new FormData();
      if (isFounding) fd.set("isFounding", "on");
      if (reason.trim()) fd.set("reason", reason.trim());
      const r = await adminUpdateFoundingDoctorAction(doctorId, fd);
      if (!r.ok) setError(r.error);
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={isFounding}
          onChange={(e) => {
            setIsFounding(e.target.checked);
            setSaved(false);
          }}
          className="mt-0.5 size-4"
        />
        <span>
          <span className="font-medium">Founding Doctor</span>
          <span className="block text-xs text-muted-foreground">
            Awards the gold badge and top placement in search. Normally earned by
            referring 5 verified doctors — granting here is a manual override.
          </span>
        </span>
      </label>

      <div className="space-y-1.5">
        <Label htmlFor="foundingReason">Reason (optional)</Label>
        <Input
          id="foundingReason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setSaved(false);
          }}
          placeholder="e.g. high-value onboarding"
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">Recorded in the audit log.</p>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Qualified referrals on record: <strong>{initial.qualifiedReferrals}</strong>
        {initial.awardedAt ? (
          <span className="block">
            Badge awarded {new Date(initial.awardedAt).toLocaleDateString()}.
          </span>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {saved ? <p className="text-sm text-emerald-600">Saved.</p> : null}

      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Saving…" : "Save founding status"}
      </Button>
    </div>
  );
}
