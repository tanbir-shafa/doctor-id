"use client";

import { QualificationsEditor } from "@/app/(dashboard)/dashboard/profile/qualifications-editor";
import { adminUpdateProfileQualificationsAction } from "@/server/actions/admin-doctor";
import type { DoctorQualification } from "@/types/doctor";

export function AdminQualificationsSection({
  initial,
  doctorId,
}: {
  initial: DoctorQualification[];
  doctorId: string;
}) {
  return (
    <QualificationsEditor
      initial={initial}
      submitAction={(form) => adminUpdateProfileQualificationsAction(doctorId, form)}
    />
  );
}
