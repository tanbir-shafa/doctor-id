/**
 * Generic audit-log writer.
 *
 * Call this from any server action that performs an admin-level mutation we
 * want to keep a trail of (profile edits, claim approvals, role changes, …).
 * The collection is shared — distinguish actions via `type` + `entityType`.
 *
 * Writes are best-effort: a failure here must NOT roll back the underlying
 * mutation. The caller has already saved the change; losing one audit row is
 * preferable to surfacing a confusing error to the operator.
 */

import type { Loose } from "@/lib/db/models/loose";
import { Types } from "mongoose";
import { AuditLog } from "@/lib/db/models";

export type AuditActorRole = "admin" | "doctor" | "patient" | "system";

export interface RecordAuditLogInput {
  type: string;
  entityType: "Doctor" | "ClaimRequest" | "User" | (string & {});
  entityId: string | Types.ObjectId;
  actorId?: string | Types.ObjectId | null;
  actorRole?: AuditActorRole;
  actorEmail?: string | null;
  metadata?: Record<string, unknown> | null;
  note?: string | null;
}

export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  try {
    await (AuditLog as unknown as Loose).create({
      type: input.type,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? "system",
      actorEmail: input.actorEmail ?? null,
      metadata: input.metadata ?? null,
      note: input.note ?? null,
    });
  } catch (err) {
    console.warn("[audit] failed to record entry", {
      type: input.type,
      entityType: input.entityType,
      entityId: String(input.entityId),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export interface AuditLogItem {
  _id: string;
  type: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  actorRole: AuditActorRole;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
  note: string | null;
  createdAt: string;
}

/**
 * Read the most recent audit entries for one entity. Used by the admin doctor
 * edit page to render an "Edit history" panel at the bottom.
 */
export async function listAuditLogForEntity(
  entityType: string,
  entityId: string | Types.ObjectId,
  limit = 20,
): Promise<AuditLogItem[]> {
  const rows = await (AuditLog as unknown as Loose)
    .find({ entityType, entityId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return (rows as unknown[]).map((r) => JSON.parse(JSON.stringify(r))) as AuditLogItem[];
}
