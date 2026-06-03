"use client";

import { BasicSectionForm } from "@/app/(dashboard)/dashboard/profile/basic-form";
import { adminUpdateProfileBasicAction } from "@/server/actions/admin-doctor";
import type { DoctorDocLike } from "@/types/doctor";

export function AdminBasicSection({
  doctor,
  doctorId,
}: {
  doctor: DoctorDocLike;
  doctorId: string;
}) {
  return (
    <BasicSectionForm
      doctor={doctor}
      submitAction={(form) => adminUpdateProfileBasicAction(doctorId, form)}
    />
  );
}
