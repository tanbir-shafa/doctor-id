import { cn } from "@/lib/utils";
import type { ChamberScheduleSlot } from "@/types/doctor";

const DAY_LABELS: Record<string, string> = {
  sat: "Sat",
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
};
const DAY_ORDER = ["sat", "sun", "mon", "tue", "wed", "thu", "fri"]; // BD work week

export function ScheduleGrid({ schedule }: { schedule: ChamberScheduleSlot[] }) {
  const byDay = new Map<string, ChamberScheduleSlot>();
  for (const s of schedule) byDay.set(s.day, s);

  return (
    <ul className="grid grid-cols-7 gap-2 text-center">
      {DAY_ORDER.map((day) => {
        const slot = byDay.get(day);
        const available = slot?.available ?? false;
        return (
          <li
            key={day}
            className={cn(
              "rounded-md border px-1 py-2 text-xs",
              available ? "border-primary/40 bg-primary/5" : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            <div className="font-medium text-foreground">{DAY_LABELS[day]}</div>
            <div className="mt-1 text-[11px]">
              {available && slot ? `${slot.startTime}–${slot.endTime}` : "Closed"}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
