"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Search, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DoctorSpecialty } from "@/types/doctor";

type SubmitResult = { ok: true } | { ok: false; error: string };
type SubmitAction = (form: FormData) => Promise<SubmitResult>;

/**
 * Specialties editor. The doctor's specialty list is small (1–5) and the
 * server-side action wholesale-replaces the array, so the UI is a thin list
 * + add/remove, matching the qualifications editor's pattern.
 *
 * The first row is always primary; reordering or explicit "make primary" lives
 * out-of-scope for v1 (admin can delete + re-add to reorder).
 */
export function SpecialtiesEditor({
  initial,
  submitAction,
  catalog,
}: {
  initial: DoctorSpecialty[];
  submitAction: SubmitAction;
  /** Known specialty names — populates a datalist for autocomplete. Optional. */
  catalog?: string[];
}) {
  const [rows, setRows] = useState<DoctorSpecialty[]>(() =>
    initial.length > 0
      ? initial.map((s, i) => ({ name: s.name, isPrimary: i === 0, fhirCode: s.fhirCode }))
      : [],
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [filter, setFilter] = useState("");

  // Sort catalog A→Z once per change — the server query orders by curated
  // sortOrder, but alphabetical is friendlier to scan for a doctor who
  // already knows what they're looking for.
  const sortedCatalog = useMemo(
    () => (catalog ? [...catalog].sort((a, b) => a.localeCompare(b)) : []),
    [catalog],
  );

  const pickedLower = useMemo(
    () => new Set(rows.map((r) => r.name.trim().toLowerCase()).filter(Boolean)),
    [rows],
  );

  const availableCatalog = useMemo(
    () => sortedCatalog.filter((c) => !pickedLower.has(c.toLowerCase())),
    [sortedCatalog, pickedLower],
  );

  const filteredCatalog = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return availableCatalog;
    return availableCatalog.filter((c) => c.toLowerCase().includes(q));
  }, [availableCatalog, filter]);

  function update(i: number, name: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, name } : row)));
  }
  function add() {
    setRows((r) => [...r, { name: "", isPrimary: r.length === 0 }]);
  }
  function remove(i: number) {
    setRows((r) =>
      r
        .filter((_, idx) => idx !== i)
        .map((row, idx) => ({ ...row, isPrimary: idx === 0 })),
    );
  }
  function save() {
    setMsg(null);
    const payload = rows
      .filter((r) => r.name.trim())
      .map((r, i) => ({ name: r.name.trim(), isPrimary: i === 0, fhirCode: r.fhirCode }));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("specialties", JSON.stringify(payload));
      const r = await submitAction(fd);
      setMsg(r.ok ? { tone: "ok", text: "Saved." } : { tone: "err", text: r.error });
    });
  }

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No specialties yet. Add at least one.</p>
      ) : null}
      <ul className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <Label htmlFor={`sp-${i}`}>
                Specialty
                {i === 0 ? (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    <Star className="size-3" aria-hidden="true" /> Primary
                  </span>
                ) : null}
              </Label>
              <Input
                id={`sp-${i}`}
                value={row.name}
                onChange={(e) => update(i, e.target.value)}
                list={catalog ? "specialty-catalog" : undefined}
                placeholder="e.g. Cardiology"
              />
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove">
              <Trash2 className="size-4 text-destructive" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      {catalog ? (
        <datalist id="specialty-catalog">
          {sortedCatalog.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
      {catalog && catalog.length > 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              Quick pick — tap to add
              <span className="ml-1 text-muted-foreground/70">
                ({sortedCatalog.length} specialties
                {filter.trim() ? ` · ${filteredCatalog.length} matching` : null}
                {pickedLower.size > 0 && !filter.trim()
                  ? ` · ${availableCatalog.length} available`
                  : null}
                )
              </span>
            </p>
          </div>
          <div className="relative mb-3">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder="Filter specialties (e.g. cardio, surg)"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 pl-8 text-sm"
              aria-label="Filter specialties"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableCatalog.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                All catalog specialties added. You can also type a custom one above.
              </span>
            ) : filteredCatalog.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                No specialties match &quot;{filter.trim()}&quot;.{" "}
                <button
                  type="button"
                  onClick={() => setFilter("")}
                  className="text-primary hover:underline"
                >
                  Clear filter
                </button>
              </span>
            ) : (
              filteredCatalog.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() =>
                    setRows((rs) => [...rs, { name: c, isPrimary: rs.length === 0 }])
                  }
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  {c}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <Button variant="outline" type="button" onClick={add}>
          <Plus className="size-4" aria-hidden="true" /> Add specialty
        </Button>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save specialties"}
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
