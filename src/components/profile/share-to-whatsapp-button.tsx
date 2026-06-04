"use client";

import {Share2} from "lucide-react";
import {buttonVariants} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {buildShareText, buildWhatsappShareUrl} from "@/lib/share/text";

/**
 * Loop D — "Share this profile on WhatsApp" CTA.
 *
 * Distinct from `WhatsappButton` (which contacts the doctor on THEIR number).
 * This one opens WhatsApp's pick-a-contact sheet with a prefilled message —
 * lets the doctor or a visitor blast the profile URL into a chat / group.
 */
export function ShareToWhatsappButton({
    doctor,
    label = "Share on WhatsApp",
    variant = "outline",
}: {
    doctor: {
        slug: string;
        name: {prefix: string; displayName: string};
        specialties: Array<{name: string; isPrimary: boolean}>;
        chambers: Array<{area: string; district: string; isPrimary: boolean}>;
    };
    label?: string;
    variant?: "default" | "outline";
}) {
    const primarySpec = doctor.specialties.find((s) => s.isPrimary) ?? doctor.specialties[0];
    const primaryChamber = doctor.chambers.find((c) => c.isPrimary) ?? doctor.chambers[0];
    const text = buildShareText({
        displayName: doctor.name.displayName,
        prefix: doctor.name.prefix,
        specialty: primarySpec?.name,
        chamberSummary: primaryChamber ? `${primaryChamber.area}, ${primaryChamber.district}` : undefined,
        slug: doctor.slug,
    });
    const href = buildWhatsappShareUrl(text);
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                buttonVariants({variant, size: "lg"}),
                "w-full whitespace-normal text-center leading-tight",
            )}
        >
            <Share2 className="size-4 shrink-0" aria-hidden="true" />
            {label}
        </a>
    );
}
