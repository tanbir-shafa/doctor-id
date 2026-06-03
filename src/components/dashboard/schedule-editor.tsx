"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ScheduleDay = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export interface ScheduleSlot {
  day: ScheduleDay;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  available: boolean;
}

const DAY_ORDER: Array<{ key: ScheduleDay; label: string }> = [
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
];

interface Props {
  value: ScheduleSlot[];
  onChange: (next: ScheduleSlot[]) => void;
}

/**
 * 7-day schedule grid. Each day can have multiple slots. Pure controlled
 * component — the parent owns the array; this just emits a new array on
 * every mutation. The Bangladesh standard week starts Saturday and ends
 * Friday, so the columns lead with Sat.
 */
export function ScheduleEditor({ value, onChange }: Props) {
  function update(idx: number, patch: Partial<ScheduleSlot>) {
    onChange(value.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function removeSlot(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  function addSlot(day: ScheduleDay) {
    onChange([...value, { day, startTime: "17:00", endTime: "21:00", available: true }]);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DAY_ORDER.map(({ key, label }) => {
          const slots = value
            .map((s, i) => ({ slot: s, idx: i }))
            .filter(({ slot }) => slot.day === key);

          return (
            <div key={key} className="rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{label}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => addSlot(key)}
                  aria-label={`Add slot to ${label}`}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                </Button>
              </div>

              {slots.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No slots — closed.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {slots.map(({ slot, idx }) => (
                    <li key={idx} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => update(idx, { startTime: e.target.value })}
                        className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm"
                        aria-label="Start time"
                      />
                      <span className="text-xs text-muted-foreground">to</span>
                      <input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => update(idx, { endTime: e.target.value })}
                        className="w-24 rounded-md border border-input bg-background px-2 py-1 text-sm"
                        aria-label="End time"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeSlot(idx)}
                        aria-label="Remove slot"
                      >
                        <Trash2 className="size-3.5 text-destructive" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
