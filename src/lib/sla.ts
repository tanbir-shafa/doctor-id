/**
 * 24h verification SLA — pure classification + formatting helpers.
 *
 * This module is import-safe from both server and client components. Keep it
 * free of mongoose/Node-only imports so client bundles don't accidentally
 * drag the DB driver into the browser.
 */

export const VERIFICATION_SLA_MS = 24 * 60 * 60 * 1000; // 24h

export type SlaTone = "green" | "amber" | "red";

export interface SlaClassification {
  bucket: "breached" | "lt6h" | "lt12h" | "gt12h" | "approved" | "rejected";
  tone: SlaTone;
  /** Milliseconds until breach (negative = past breach). Null for resolved rows. */
  remainingMs: number | null;
  label: string;
}

const HOUR = 60 * 60 * 1000;

export function classifySla(
  claim: { status: string; slaExpiresAt?: Date | string | null; verifiedAt?: Date | string | null },
  now: Date = new Date(),
): SlaClassification {
  if (claim.status === "approved") {
    return { bucket: "approved", tone: "green", remainingMs: null, label: "Verified" };
  }
  if (claim.status === "rejected") {
    return { bucket: "rejected", tone: "red", remainingMs: null, label: "Rejected" };
  }

  const expires = claim.slaExpiresAt ? new Date(claim.slaExpiresAt).getTime() : null;
  if (!expires) {
    return { bucket: "gt12h", tone: "green", remainingMs: null, label: "Pending" };
  }

  const remainingMs = expires - now.getTime();
  if (remainingMs <= 0) {
    return {
      bucket: "breached",
      tone: "red",
      remainingMs,
      label: `Breached ${formatDuration(-remainingMs)} ago`,
    };
  }
  if (remainingMs < 6 * HOUR) {
    return { bucket: "lt6h", tone: "red", remainingMs, label: `${formatDuration(remainingMs)} left` };
  }
  if (remainingMs < 12 * HOUR) {
    return { bucket: "lt12h", tone: "amber", remainingMs, label: `${formatDuration(remainingMs)} left` };
  }
  return { bucket: "gt12h", tone: "green", remainingMs, label: `${formatDuration(remainingMs)} left` };
}

export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
