import {describe, it, expect} from "vitest";
import {
    to24h,
    normalizeDay,
    normalizeStructuredSchedule,
    expandChamberTime,
    parseScheduleText,
} from "../../scripts/lib/normalize/schedule";

describe("normalizeDay", () => {
    it.each([
        ["Sunday", "sun"],
        ["sun", "sun"],
        ["Monday", "mon"],
        ["Tuesday", "tue"],
        ["TUES", "tue"],
        ["Wednesday", "wed"],
        ["Thursday", "thu"],
        ["thur", "thu"],
        ["Friday", "fri"],
        ["Saturday", "sat"],
    ])("maps %s → %s", (input, expected) => {
        expect(normalizeDay(input)).toBe(expected);
    });

    it("returns null for unknown input", () => {
        expect(normalizeDay("Funday")).toBeNull();
        expect(normalizeDay("")).toBeNull();
        expect(normalizeDay(null)).toBeNull();
    });
});

describe("to24h", () => {
    it.each([
        ["5:30 PM", "17:30"],
        ["2:00 pm", "14:00"],
        ["10am", "10:00"],
        ["9 am", "09:00"],
        ["12:00 am", "00:00"],
        ["12:00 pm", "12:00"],
        ["1:00 pm", "13:00"],
        ["17:00", "17:00"],
        ["9:05", "09:05"],
        ["00:00", "00:00"],
    ])("parses %s → %s", (input, expected) => {
        expect(to24h(input)).toBe(expected);
    });

    it("returns null for garbage", () => {
        expect(to24h("not a time")).toBeNull();
        expect(to24h("25:00")).toBeNull();
        expect(to24h("13pm")).toBeNull();
        expect(to24h("")).toBeNull();
        expect(to24h(null)).toBeNull();
    });
});

describe("normalizeStructuredSchedule", () => {
    it("converts the popular-diagnostic schedule shape", () => {
        const slots = normalizeStructuredSchedule([
            {key: 0, day: "Sunday", start_time: "2:00 pm", end_time: "5:00 pm"},
            {key: 6, day: "Saturday", start_time: "2:00 pm", end_time: "5:00 pm"},
        ]);
        expect(slots).toEqual([
            {day: "sun", startTime: "14:00", endTime: "17:00", available: true},
            {day: "sat", startTime: "14:00", endTime: "17:00", available: true},
        ]);
    });

    it("drops rows with unparseable day or times", () => {
        const slots = normalizeStructuredSchedule([
            {day: "Sunday", start_time: "5:00 pm", end_time: "9:00 pm"},
            {day: "Funday", start_time: "5:00 pm", end_time: "9:00 pm"},
            {day: "Monday", start_time: "bad", end_time: "9:00 pm"},
            {day: "Tuesday", start_time: "9:00 pm", end_time: "5:00 pm"}, // start >= end
        ]);
        expect(slots).toHaveLength(1);
        expect(slots[0]!.day).toBe("sun");
    });

    it("returns [] for non-array input", () => {
        expect(normalizeStructuredSchedule(null)).toEqual([]);
        expect(normalizeStructuredSchedule("oops")).toEqual([]);
        expect(normalizeStructuredSchedule(undefined)).toEqual([]);
    });
});

describe("expandChamberTime (ibn-sina shape)", () => {
    it("expands a single time range over days NOT in off-day list", () => {
        const slots = expandChamberTime("(05:30 PM-09:00 PM)", "TUE,THU,FRI");
        // Days present should be sun, mon, wed, sat.
        expect(slots.map((s) => s.day).sort()).toEqual(["mon", "sat", "sun", "wed"]);
        for (const s of slots) {
            expect(s.startTime).toBe("17:30");
            expect(s.endTime).toBe("21:00");
        }
    });

    it("covers all 7 days when off-day list is empty", () => {
        const slots = expandChamberTime("10:00 AM - 1:00 PM", "");
        expect(slots).toHaveLength(7);
    });

    it("returns [] when chamber_time has no recognizable range", () => {
        expect(expandChamberTime("on appointment", "")).toEqual([]);
        expect(expandChamberTime(null, null)).toEqual([]);
    });
});

describe("parseScheduleText (doctor-bangladesh prose)", () => {
    it("extracts a time range and respects '(Closed: Friday)'", () => {
        const slots = parseScheduleText(
            "Practicing hour of Dr. M. S. Newaz at Mid Town is 10am to 8pm (Closed: Friday).",
        );
        // Six days, no Friday.
        expect(slots).toHaveLength(6);
        expect(slots.find((s) => s.day === "fri")).toBeUndefined();
        for (const s of slots) {
            expect(s.startTime).toBe("10:00");
            expect(s.endTime).toBe("20:00");
        }
    });

    it("defaults to Friday-closed when no closure clause is present", () => {
        const slots = parseScheduleText("Chamber hours: 5:00 PM - 9:00 PM.");
        expect(slots.find((s) => s.day === "fri")).toBeUndefined();
        expect(slots).toHaveLength(6);
    });

    it("returns [] when no time range can be extracted", () => {
        expect(parseScheduleText("Please call to confirm")).toEqual([]);
        expect(parseScheduleText("")).toEqual([]);
        expect(parseScheduleText(null)).toEqual([]);
    });
});
