"use client";

import { ChambersEditor } from "@/app/(dashboard)/dashboard/chambers/chambers-editor";
import { adminUpdateChambersAction } from "@/server/actions/admin-doctor";
import type { DoctorChamber } from "@/types/doctor";

type ChamberInitial = {
  name: string;
  address: string;
  area: string;
  city: string;
  division: string;
  phone: string;
  consultationFee: { amount: number; currency: "BDT" | "USD" };
  coordinates: { lat: number | null; lng: number | null };
  schedule: DoctorChamber["schedule"];
  isPrimary: boolean;
};

export function AdminChambersSection({
  initialChambers,
  doctorId,
}: {
  initialChambers: ChamberInitial[];
  doctorId: string;
}) {
  return (
    <ChambersEditor
      initialChambers={initialChambers}
      submitAction={(form) => adminUpdateChambersAction(doctorId, form)}
    />
  );
}
