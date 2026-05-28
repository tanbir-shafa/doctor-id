"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileExperienceAction } from "@/server/actions/doctor";
import type { DoctorExperience } from "@/types/doctor";

type Row = { role: string; organization: string; from: string; to: string; current: boolean };

function toIsoDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function ExperienceEditor({ initial }: { initial: DoctorExperience[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    initial.map((e) => ({
      role: e.role,
      organization: e.organization,
      from: toIsoDate(e.from),
      to: toIsoDate(e.to ?? null),
      current: Boolean(e.current),
    })),
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function update(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function add() {
    setRows((r) => [...r, { role: "", organization: "", from: "", to: "", current: false }]);
  }
  function remove(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }
  function save() {
    setMsg(null);
    const payload = rows.map((r) => ({
      role: r.role,
      organization: r.organization,
      from: r.from,
      to: r.current ? null : r.to || null,
      current: r.current,
    }));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("experience", JSON.stringify(payload));
      const r = await updateProfileExperienceAction(fd);
      setMsg(r.ok ? { tone: "ok", text: "Saved." } : { tone: "err", text: r.error });
    });
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No experience entries yet.</p>
      ) : null}
      <ul className="space-y-3">
        {rows.map((row, i) => (
          <li key={i} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_140px_140px_auto]">
            <div className="space-y-1">
              <Label htmlFor={`r-${i}`}>Role</Label>
              <Input id={`r-${i}`} value={row.role} onChange={(e) => update(i, { role: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`o-${i}`}>Organization</Label>
              <Input id={`o-${i}`} value={row.organization} onChange={(e) => update(i, { organization: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`from-${i}`}>From</Label>
              <Input id={`from-${i}`} type="date" value={row.from} onChange={(e) => update(i, { from: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`to-${i}`}>To</Label>
              <Input
                id={`to-${i}`}
                type="date"
                value={row.to}
                disabled={row.current}
                onChange={(e) => update(i, { to: e.target.value })}
              />
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={row.current}
                  onChange={(e) => update(i, { current: e.target.checked })}
                  className="size-3.5"
                />
                Current
              </label>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove">
              <Trash2 className="size-4 text-destructive" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <Button variant="outline" type="button" onClick={add}>
          <Plus className="size-4" aria-hidden="true" /> Add experience
        </Button>
        <Button type="button" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save experience"}</Button>
        {msg ? <p className={msg.tone === "ok" ? "text-sm text-green-600" : "text-sm text-destructive"}>{msg.text}</p> : null}
      </div>
    </div>
  );
}
