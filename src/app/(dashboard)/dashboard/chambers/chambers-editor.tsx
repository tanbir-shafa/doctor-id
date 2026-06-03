"use client";

import { useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import { MapPin, Plus, Trash2, Star } from "lucide-react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChambersUpdateSchema } from "@/lib/validators/doctor";
import { ScheduleEditor, type ScheduleSlot } from "@/components/dashboard/schedule-editor";
import { updateChambersAction } from "@/server/actions/doctor";

// Use `z.input` (pre-default) so RHF's form state aligns with the inputs the
// user actually edits — Zod adds defaults for missing `available`, `schedule`,
// etc. at parse time, which is precisely what we want for submit.
type ChambersForm = z.input<typeof ChambersUpdateSchema>;

const LeafletLazy = dynamic(() => import("@/components/map/leaflet-lazy"), { ssr: false });

// Default coords: Dhaka city center. Doctors click/drag to pin their real spot.
const DEFAULT_LAT = 23.8103;
const DEFAULT_LNG = 90.4125;

type ChamberFormValue = ChambersForm["chambers"][number];

type SubmitResult = { ok: true } | { ok: false; error: string };
type SubmitAction = (form: FormData) => Promise<SubmitResult>;

const EMPTY_CHAMBER: ChamberFormValue = {
  name: "",
  address: "",
  area: "",
  city: "Dhaka",
  division: "Dhaka",
  phone: "",
  consultationFee: { amount: 0, currency: "BDT" },
  coordinates: { lat: null, lng: null },
  schedule: [],
  isPrimary: false,
};

interface Props {
  initialChambers: ChamberFormValue[];
  submitAction?: SubmitAction;
}

export function ChambersEditor({ initialChambers, submitAction }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Normalize initial data into the editor's shape — handle legacy docs that
  // might have undefined fields.
  const defaultValues: ChambersForm = {
    chambers: (initialChambers ?? []).map((c) => ({
      name: c.name ?? "",
      address: c.address ?? "",
      area: c.area ?? "",
      city: c.city ?? "Dhaka",
      division: c.division ?? "Dhaka",
      phone: c.phone ?? "",
      consultationFee: c.consultationFee ?? { amount: 0, currency: "BDT" },
      coordinates: c.coordinates ?? { lat: null, lng: null },
      schedule: (c.schedule ?? []) as ScheduleSlot[],
      isPrimary: Boolean(c.isPrimary),
    })),
  };

  const form = useForm<ChambersForm>({
    // zodResolver's type generic is fussy about Zod inputs with `.default()`
    // — cast keeps RHF happy without giving up runtime safety (Zod still
    // parses on submit).
    resolver: zodResolver(ChambersUpdateSchema) as never,
    defaultValues: defaultValues as never,
    mode: "onBlur",
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "chambers" });

  function makePrimary(idx: number) {
    fields.forEach((_, i) => {
      form.setValue(`chambers.${i}.isPrimary`, i === idx, { shouldDirty: true });
    });
  }

  const onSubmit = (data: ChambersForm) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("chambers", JSON.stringify(data.chambers));
      const action = submitAction ?? updateChambersAction;
      const r = await action(fd);
      if (!r.ok) setError(r.error);
      else setSuccess("Chambers saved. Your public profile is updated.");
    });
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {fields.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No chambers yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Add your first chamber so patients can find you.
          </CardContent>
        </Card>
      ) : null}

      <ul className="space-y-4">
        {fields.map((field, idx) => {
          // eslint-disable-next-line react-hooks/incompatible-library
          const coords = form.watch(`chambers.${idx}.coordinates`);
          const isPrimary = form.watch(`chambers.${idx}.isPrimary`);
          const lat = coords?.lat ?? DEFAULT_LAT;
          const lng = coords?.lng ?? DEFAULT_LNG;
          const schedule = (form.watch(`chambers.${idx}.schedule`) ?? []) as ScheduleSlot[];
          const errs = form.formState.errors.chambers?.[idx];

          return (
            <li key={field.id}>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="size-4 text-primary" aria-hidden="true" />
                      Chamber {idx + 1}
                      {isPrimary ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          <Star className="size-3" aria-hidden="true" /> Primary
                        </span>
                      ) : null}
                    </CardTitle>
                    <div className="flex flex-wrap gap-2">
                      {!isPrimary ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => makePrimary(idx)}>
                          <Star className="size-3.5" aria-hidden="true" /> Make primary
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(idx)}
                        aria-label={`Remove chamber ${idx + 1}`}
                      >
                        <Trash2 className="size-3.5 text-destructive" aria-hidden="true" /> Remove
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`name-${idx}`}>Chamber name</Label>
                      <Input id={`name-${idx}`} {...form.register(`chambers.${idx}.name`)} />
                      {errs?.name ? <p className="text-xs text-destructive">{errs.name.message}</p> : null}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`phone-${idx}`}>Chamber phone</Label>
                      <Input id={`phone-${idx}`} {...form.register(`chambers.${idx}.phone`)} placeholder="+8801…" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`address-${idx}`}>Address</Label>
                    <Input id={`address-${idx}`} {...form.register(`chambers.${idx}.address`)} />
                    {errs?.address ? <p className="text-xs text-destructive">{errs.address.message}</p> : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor={`area-${idx}`}>Area</Label>
                      <Input id={`area-${idx}`} {...form.register(`chambers.${idx}.area`)} />
                      {errs?.area ? <p className="text-xs text-destructive">{errs.area.message}</p> : null}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`city-${idx}`}>City</Label>
                      <Input id={`city-${idx}`} {...form.register(`chambers.${idx}.city`)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`division-${idx}`}>Division</Label>
                      <Input id={`division-${idx}`} {...form.register(`chambers.${idx}.division`)} />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`fee-${idx}`}>Consultation fee</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id={`fee-${idx}`}
                          type="number"
                          min={0}
                          step={50}
                          {...form.register(`chambers.${idx}.consultationFee.amount`, {
                            valueAsNumber: true,
                          })}
                        />
                        <select
                          {...form.register(`chambers.${idx}.consultationFee.currency`)}
                          className="h-10 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="BDT">BDT</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Location</Label>
                    <p className="text-xs text-muted-foreground">
                      Click the map or drag the pin to set the chamber location.
                    </p>
                    <LeafletLazy
                      lat={lat}
                      lng={lng}
                      label={form.watch(`chambers.${idx}.name`) || `Chamber ${idx + 1}`}
                      height={260}
                      onLocationChange={(newLat, newLng) => {
                        form.setValue(`chambers.${idx}.coordinates`, { lat: newLat, lng: newLng }, {
                          shouldDirty: true,
                        });
                      }}
                    />
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {coords?.lat != null && coords?.lng != null
                        ? `Pinned at ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                        : "No pin set — click the map."}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Weekly schedule</Label>
                    <ScheduleEditor
                      value={schedule}
                      onChange={(next) => {
                        form.setValue(`chambers.${idx}.schedule`, next, { shouldDirty: true });
                      }}
                    />
                    {errs?.schedule ? (
                      <p className="text-xs text-destructive">
                        {/* RHF nests overlap errors under schedule.<n>.startTime */}
                        Fix overlapping or invalid time slots above.
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => append({ ...EMPTY_CHAMBER, isPrimary: fields.length === 0 })}
        >
          <Plus className="size-4" aria-hidden="true" /> Add chamber
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
          <Button type="submit" disabled={pending || !form.formState.isDirty}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
