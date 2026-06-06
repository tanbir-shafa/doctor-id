"use client";

import { PublishToggle } from "@/app/(dashboard)/dashboard/profile/publish-toggle";
import { adminSetPublishStatusAction } from "@/server/actions/admin-doctor";
import type { DoctorStatus } from "@/types/doctor";

export function AdminPublishSection({
  initialStatus,
  doctorId,
  missing,
}: {
  initialStatus: DoctorStatus;
  doctorId: string;
  /** Mandatory-for-publish fields still missing — admin sees a warning but can override. */
  missing?: { key: string; label: string }[];
}) {
  return (
    <PublishToggle
      initialStatus={initialStatus}
      submitAction={(publish) => adminSetPublishStatusAction(doctorId, publish)}
      missing={missing}
      blockOnMissing={false}
    />
  );
}
