"use client";

import {StatusEditor} from "@/app/(dashboard)/dashboard/profile/status-editor";
import {adminUpdateProfileStatusAction} from "@/server/actions/admin-doctor";

export function AdminStatusSection({
    initial,
    doctorId,
}: {
    initial: {
        designation?: string | null;
        institute?: string | null;
        yearsOfExperience?: number | null;
    };
    doctorId: string;
}) {
    return (
        <StatusEditor
            initial={initial}
            submitAction={(form) => adminUpdateProfileStatusAction(doctorId, form)}
        />
    );
}
