"use client";

import {CredentialsEditor} from "@/app/(dashboard)/dashboard/profile/credentials-editor";
import {adminUpdateProfileCredentialsAction} from "@/server/actions/admin-doctor";
import type {DoctorAward, DoctorMembership, DoctorPublication} from "@/types/doctor";

export function AdminCredentialsSection({
    initial,
    doctorId,
}: {
    initial: {
        awards?: DoctorAward[];
        memberships?: DoctorMembership[];
        publications?: DoctorPublication[];
    };
    doctorId: string;
}) {
    return (
        <CredentialsEditor
            initial={initial}
            submitAction={(form) => adminUpdateProfileCredentialsAction(doctorId, form)}
        />
    );
}
