"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AppointmentRequestForm } from "./appointment-request-form";

type DayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

interface ChamberScheduleSlot {
  day: DayKey;
  startTime: string;
  endTime: string;
  available: boolean;
}

interface ChamberOption {
  _id: string;
  name: string;
  area?: string;
  city?: string;
  schedule?: ChamberScheduleSlot[];
}

/**
 * Trigger + dialog wrapper around the public appointment-request form.
 *
 * The bare form is too tall for the sidebar on a long profile — moving it to a
 * dialog keeps the contact card compact and gives the form room to breathe.
 */
export function AppointmentRequestDialog({
  slug,
  doctorName,
  chambers,
}: {
  slug: string;
  doctorName: string;
  chambers: ChamberOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="lg"
        className="w-full whitespace-normal leading-tight"
        onClick={() => setOpen(true)}
      >
        <CalendarPlus className="size-4 shrink-0" aria-hidden="true" />
        Request appointment
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Request an appointment with ${doctorName}`}
        description="The doctor will get in touch on WhatsApp. No login needed."
      >
        <AppointmentRequestForm slug={slug} chambers={chambers} />
      </Dialog>
    </>
  );
}
