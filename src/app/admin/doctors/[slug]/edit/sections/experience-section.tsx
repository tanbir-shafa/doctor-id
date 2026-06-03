"use client";

import { ExperienceEditor } from "@/app/(dashboard)/dashboard/profile/experience-editor";
import { adminUpdateProfileExperienceAction } from "@/server/actions/admin-doctor";
import type { DoctorExperience } from "@/types/doctor";

export function AdminExperienceSection({
  initial,
  doctorId,
}: {
  initial: DoctorExperience[];
  doctorId: string;
}) {
  return (
    <ExperienceEditor
      initial={initial}
      submitAction={(form) => adminUpdateProfileExperienceAction(doctorId, form)}
    />
  );
}
