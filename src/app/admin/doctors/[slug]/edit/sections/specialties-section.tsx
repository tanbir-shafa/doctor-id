"use client";

import { SpecialtiesEditor } from "@/components/dashboard/specialties-editor";
import { adminUpdateProfileSpecialtiesAction } from "@/server/actions/admin-doctor";
import type { DoctorSpecialty } from "@/types/doctor";

export function AdminSpecialtiesSection({
  initial,
  doctorId,
  catalog,
}: {
  initial: DoctorSpecialty[];
  doctorId: string;
  catalog?: string[];
}) {
  return (
    <SpecialtiesEditor
      initial={initial}
      catalog={catalog}
      submitAction={(form) => adminUpdateProfileSpecialtiesAction(doctorId, form)}
    />
  );
}
