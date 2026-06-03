/**
 * Schedule normalization for the ingest pipeline.
 *
 * Three input shapes appear across the four datasets:
 *
 *   A. Structured row arrays (popular, ibn-sina):
 *      [{ day: "Sunday", start_time: "2:00 pm", end_time: "5:00 pm", ... }]
 *
 *   B. Chamber-level summary strings (ibn-sina secondary):
 *      chamber_time: "(05:30 PM-09:00 PM)"  +  off_day: "TUE,THU,FRI"
 *
 *   C. Free-text prose (doctor-bangladesh content.rendered):
 *      "Practicing hour of Dr. X at Y is 10am to 8pm (Closed: Friday)."
 *
 * Output is always the same: `ChamberScheduleSlot[]` where each slot uses
 * the same shape the Mongoose ChamberSchema expects — `day` as short code
 * ("sun".."sat"), `startTime`/`endTime` as HH:mm 24-hour, `available: true`.
 *
 * Note: this module is pure (no I/O, no Date.now). Bad / unparseable input
 * returns `[]` so callers can decide whether to flag low confidence.
 */

export type DayCode = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export interface ChamberScheduleSlot {
    day: DayCode;
    startTime: string; // "HH:mm"
    endTime: string;   // "HH:mm"
    available: boolean;
}

const DAY_LOOKUP: Record<string, DayCode> = {
    sunday: "sun", sun: "sun",
    monday: "mon", mon: "mon",
    tuesday: "tue", tue: "tue", tues: "tue",
    wednesday: "wed", wed: "wed",
    thursday: "thu", thu: "thu", thurs: "thu", thur: "thu",
    friday: "fri", fri: "fri",
    saturday: "sat", sat: "sat",
};

const DAY_ORDER: DayCode[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function normalizeDay(raw: unknown): DayCode | null {
    if (typeof raw !== "string") return null;
    return DAY_LOOKUP[raw.trim().toLowerCase()] ?? null;
}

/**
 * Convert a 12h or 24h time string to canonical "HH:mm" 24-hour form.
 * Accepts: "5:30 PM", "2:00 pm", "17:00", "9am", "10:5pm", "9 am", "21:00".
 * Returns null for anything we can't parse.
 */
export function to24h(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const s = raw.trim().toLowerCase().replace(/\s+/g, "");
    if (!s) return null;

    // 24h form first: optional leading 0, colon, minutes.
    const m24 = s.match(/^([01]?\d|2[0-3]):?([0-5]\d)?$/);
    if (m24 && !/[ap]m/.test(s)) {
        const h = parseInt(m24[1]!, 10);
        const mm = m24[2] ? parseInt(m24[2], 10) : 0;
        return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }

    // 12h form: hour, optional :minute, am/pm.
    const m12 = s.match(/^(\d{1,2})(?::?([0-5]?\d))?\s*(am|pm)$/);
    if (m12) {
        let h = parseInt(m12[1]!, 10);
        const mm = m12[2] ? parseInt(m12[2], 10) : 0;
        const ampm = m12[3]!;
        if (h < 1 || h > 12) return null;
        if (mm < 0 || mm > 59) return null;
        if (ampm === "pm" && h !== 12) h += 12;
        if (ampm === "am" && h === 12) h = 0;
        return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }

    return null;
}

interface StructuredRow {
    day?: unknown;
    start_time?: unknown;
    end_time?: unknown;
    appointment_type?: unknown;
}

/**
 * Shape A — structured rows from popular-diagnostic + ibn-sina detail JSONs.
 * Silently drops rows with unparseable day or times.
 */
export function normalizeStructuredSchedule(rows: unknown): ChamberScheduleSlot[] {
    if (!Array.isArray(rows)) return [];
    const out: ChamberScheduleSlot[] = [];
    for (const row of rows as StructuredRow[]) {
        const day = normalizeDay(row.day);
        const start = to24h(row.start_time);
        const end = to24h(row.end_time);
        if (!day || !start || !end) continue;
        if (start >= end) continue;
        out.push({day, startTime: start, endTime: end, available: true});
    }
    return out;
}

/**
 * Shape B — ibn-sina "(05:30 PM-09:00 PM)" + "TUE,THU,FRI" off-day list.
 * Builds a schedule covering every day NOT in the off-day list.
 */
export function expandChamberTime(
    chamberTime: unknown,
    offDays: unknown,
): ChamberScheduleSlot[] {
    if (typeof chamberTime !== "string") return [];
    const m = chamberTime.match(/\(?\s*(\d{1,2}(?::\d{2})?\s*[APap][Mm])\s*[-–to]+\s*(\d{1,2}(?::\d{2})?\s*[APap][Mm])\s*\)?/);
    if (!m) return [];
    const start = to24h(m[1]!);
    const end = to24h(m[2]!);
    if (!start || !end || start >= end) return [];

    const off = new Set<DayCode>();
    if (typeof offDays === "string") {
        for (const token of offDays.split(/[,\s]+/)) {
            const day = normalizeDay(token);
            if (day) off.add(day);
        }
    }

    return DAY_ORDER.filter((d) => !off.has(d)).map((day) => ({
        day,
        startTime: start,
        endTime: end,
        available: true,
    }));
}

/**
 * Shape C — free-text prose from doctor-bangladesh narrative.
 *
 * Matches the most common pattern: "X to Y" or "X-Y" time range, optionally
 * with "(Closed: Day)" or "Closed Day". Returns a schedule covering every
 * day EXCEPT the closed days. If no closed-day clause is found, assumes the
 * range covers all non-Friday days (Friday is the BD weekend default).
 *
 * Returns `[]` if no time range can be extracted — the caller should mark
 * the record as low-confidence.
 */
export function parseScheduleText(text: unknown): ChamberScheduleSlot[] {
    if (typeof text !== "string" || !text.trim()) return [];
    const s = text.replace(/\s+/g, " ").trim();

    const range = s.match(
        /(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))\s*(?:to|-|–)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM))/,
    );
    if (!range) return [];
    const start = to24h(range[1]!);
    const end = to24h(range[2]!);
    if (!start || !end || start >= end) return [];

    const closed = new Set<DayCode>();
    const closedMatch = s.match(/closed[:\s]+([A-Za-z, ]+?)(?:[.)]|$)/i);
    if (closedMatch) {
        for (const token of closedMatch[1]!.split(/[,\s]+/)) {
            const day = normalizeDay(token);
            if (day) closed.add(day);
        }
    } else {
        // BD default: Friday is the weekend; assume it's closed unless
        // stated otherwise.
        closed.add("fri");
    }

    return DAY_ORDER.filter((d) => !closed.has(d)).map((day) => ({
        day,
        startTime: start,
        endTime: end,
        available: true,
    }));
}
