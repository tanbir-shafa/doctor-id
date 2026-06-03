/**
 * Shared share-message builder.
 *
 * Single source of truth for the WhatsApp share button, the "copy link"
 * widget, and (future) email share. The output is plain-text only — no
 * Markdown, no emoji (WhatsApp renders text inline; Markdown adds noise).
 *
 * Shape:
 *   Dr. <Name>
 *   <Specialty> · <Primary chamber, City>
 *   <URL>
 *
 * Falls back gracefully when fields are missing. Always emits a URL.
 */

import {publicEnv} from "@/lib/env";
import type {DoctorDocLike} from "@/types/doctor";

export interface ShareTextInput {
    /** Display name including title prefix, e.g. "Dr. Karim Rahman". */
    displayName: string;
    /** Title prefix on its own — used when displayName doesn't already include it. */
    prefix?: string;
    /** Primary specialty name. Optional. */
    specialty?: string;
    /** Where the doctor practices, formatted for human reading. Optional. */
    chamberSummary?: string;
    /** URL slug under doctor.id.bd. Required — that's the whole point. */
    slug: string;
}

export function buildShareText(input: ShareTextInput): string {
    const fullName = input.displayName.startsWith(input.prefix ?? "")
        ? input.displayName
        : `${input.prefix ? input.prefix + " " : ""}${input.displayName}`.trim();
    const url = `${publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/${input.slug}`;
    const middle = [input.specialty, input.chamberSummary].filter(Boolean).join(" · ");
    return middle ? `${fullName}\n${middle}\n${url}` : `${fullName}\n${url}`;
}

/**
 * Convenience overload that takes a DoctorDocLike and derives the inputs.
 */
export function buildShareTextForDoctor(doc: DoctorDocLike): string {
    const primary = doc.specialties.find((s) => s.isPrimary) ?? doc.specialties[0];
    const chamber = doc.chambers.find((c) => c.isPrimary) ?? doc.chambers[0];
    const chamberSummary = chamber ? `${chamber.area}, ${chamber.city}` : undefined;
    return buildShareText({
        displayName: doc.name.displayName,
        prefix: doc.name.prefix,
        specialty: primary?.name,
        chamberSummary,
        slug: doc.slug,
    });
}

/**
 * Build a `wa.me` URL that opens WhatsApp's share-to-contact sheet with
 * the message pre-filled. Passing no phone (the form below) opens the
 * "select contact" screen so the user picks the recipient(s).
 */
export function buildWhatsappShareUrl(text: string): string {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
