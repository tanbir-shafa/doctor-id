"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileQualificationsAction } from "@/server/actions/doctor";
import type { DoctorQualification } from "@/types/doctor";

type Row = { degree: string; institution: string; year: number; country: string };

type SubmitResult = { ok: true } | { ok: false; error: string };
type SubmitAction = (form: FormData) => Promise<SubmitResult>;

export function QualificationsEditor({
  initial,
  submitAction,
}: {
  initial: DoctorQualification[];
  submitAction?: SubmitAction;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((q) => ({ degree: q.degree, institution: q.institution, year: q.year, country: q.country ?? "Bangladesh" })),
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function update(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function add() {
    setRows((r) => [...r, { degree: "", institution: "", year: new Date().getFullYear(), country: "Bangladesh" }]);
  }
  function remove(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }
  function save() {
    setMsg(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("qualifications", JSON.stringify(rows));
      const action = submitAction ?? updateProfileQualificationsAction;
      const r = await action(fd);
      setMsg(r.ok ? { tone: "ok", text: "Saved." } : { tone: "err", text: r.error });
    });
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No qualifications yet. Add your MBBS and post-graduate degrees.</p>
      ) : null}
      <ul className="space-y-3">
        {rows.map((row, i) => (
          <li key={i} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_110px_auto]">
            <div className="space-y-1">
              <Label htmlFor={`d-${i}`}>Degree</Label>
              <Input id={`d-${i}`} value={row.degree} onChange={(e) => update(i, { degree: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`i-${i}`}>Institution</Label>
              <Input id={`i-${i}`} value={row.institution} onChange={(e) => update(i, { institution: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`y-${i}`}>Year</Label>
              <Input
                id={`y-${i}`}
                type="number"
                min={1900}
                max={new Date().getFullYear() + 1}
                value={row.year}
                onChange={(e) => update(i, { year: Number(e.target.value) || row.year })}
              />
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove">
              <Trash2 className="size-4 text-destructive" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <Button variant="outline" type="button" onClick={add}>
          <Plus className="size-4" aria-hidden="true" /> Add qualification
        </Button>
        <Button type="button" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save qualifications"}</Button>
        {msg ? <p className={msg.tone === "ok" ? "text-sm text-green-600" : "text-sm text-destructive"}>{msg.text}</p> : null}
      </div>
    </div>
  );
}
