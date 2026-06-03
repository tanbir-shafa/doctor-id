"use client";

import { ContactSectionForm } from "@/app/(dashboard)/dashboard/profile/contact-form";
import { adminUpdateProfileContactAction } from "@/server/actions/admin-doctor";
import type { DoctorDocLike } from "@/types/doctor";

export function AdminContactSection({
  doctor,
  doctorId,
}: {
  doctor: DoctorDocLike;
  doctorId: string;
}) {
  return (
    <ContactSectionForm
      doctor={doctor}
      submitAction={(form) => adminUpdateProfileContactAction(doctorId, form)}
    />
  );
}
