import type { AuditLogItem } from "@/lib/audit/log";

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtType(type: string): string {
  return type.replace(/^doctor\./, "").replace(/\./g, " · ").replace(/_/g, " ");
}

export function AuditHistoryPanel({ entries }: { entries: AuditLogItem[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No admin edits recorded for this profile yet.
      </p>
    );
  }
  return (
    <ol className="space-y-2 text-sm">
      {entries.map((e) => (
        <li
          key={e._id}
          className="grid gap-1 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-[160px_1fr_auto]"
        >
          <span className="font-mono text-xs text-slate-500">{fmtTime(e.createdAt)}</span>
          <span className="text-slate-800">
            <span className="font-medium">{fmtType(e.type)}</span>
            {e.note ? <span className="ml-2 text-slate-500">— {e.note}</span> : null}
          </span>
          <span className="text-right text-xs text-slate-500">
            {e.actorEmail ?? e.actorRole}
          </span>
        </li>
      ))}
    </ol>
  );
}
