"use client";

import {ConcentrationsEditor} from "@/components/dashboard/concentrations-editor";
import {adminUpdateProfileConcentrationsAction} from "@/server/actions/admin-doctor";

export function AdminConcentrationsSection({
    initial,
    doctorId,
}: {
    initial: string[];
    doctorId: string;
}) {
    return (
        <ConcentrationsEditor
            initial={initial}
            submitAction={(form) => adminUpdateProfileConcentrationsAction(doctorId, form)}
        />
    );
}
