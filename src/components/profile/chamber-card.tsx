import { Phone, MapPin, Banknote } from "lucide-react";
import { ScheduleGrid } from "./schedule-grid";
import LeafletLazy from "@/components/map/leaflet-lazy";
import type { DoctorChamber } from "@/types/doctor";

export function ChamberCard({ chamber }: { chamber: DoctorChamber }) {
  const fee = chamber.consultationFee?.amount ?? 0;
  return (
    <article className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{chamber.name}</h3>
          <p className="mt-1 inline-flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {chamber.address}
              {chamber.area ? `, ${chamber.area}` : ""}
              {chamber.city ? `, ${chamber.city}` : ""}
            </span>
          </p>
        </div>
        {chamber.isPrimary ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Primary</span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {chamber.phone ? (
          <a href={`tel:${chamber.phone}`} className="inline-flex items-center gap-1.5 text-foreground hover:underline">
            <Phone className="size-4" aria-hidden="true" />
            {chamber.phone}
          </a>
        ) : null}
        {fee > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <Banknote className="size-4" aria-hidden="true" />
            {Intl.NumberFormat("en-IN").format(fee)} {chamber.consultationFee?.currency ?? "BDT"}
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        <ScheduleGrid schedule={chamber.schedule} />
      </div>

      {chamber.coordinates?.lat && chamber.coordinates?.lng ? (
        <div className="mt-4">
          <LeafletLazy lat={chamber.coordinates.lat} lng={chamber.coordinates.lng} label={chamber.name} />
        </div>
      ) : null}
    </article>
  );
}
