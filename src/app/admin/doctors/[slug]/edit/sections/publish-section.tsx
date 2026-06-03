"use client";

import { PublishToggle } from "@/app/(dashboard)/dashboard/profile/publish-toggle";
import { adminSetPublishStatusAction } from "@/server/actions/admin-doctor";
import type { DoctorStatus } from "@/types/doctor";

export function AdminPublishSection({
  initialStatus,
  doctorId,
}: {
  initialStatus: DoctorStatus;
  doctorId: string;
}) {
  return (
    <PublishToggle
      initialStatus={initialStatus}
      submitAction={(publish) => adminSetPublishStatusAction(doctorId, publish)}
    />
  );
}
