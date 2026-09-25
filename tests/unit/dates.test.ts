import { describe, expect, it } from "vitest";
import { addDays, daysBetween, localDateISO } from "@/lib/local-date";
import {
  isoWeekNumber,
  monthRange,
  msUntilDateChange,
  rangeFrom,
  seriesFrom,
  shiftMonth,
  weekStartOf,
} from "@/lib/progress";
import { taskErrorMessage } from "@/lib/task-model";

/**
 * Stage 9 date / time torture: midnight, DST, week / month / year edges.
 * The database decides "today" (profiles.timezone + the monotonic history
 * boundary, pgTAP); these are the client-side calendar helpers.
 */
const at = (iso: string) => new Date(iso);
const MIN = 60_000;

describe("midnight", () => {
  it("23:59:59 → 00:00:00 in São Paulo (UTC-3) changes the local date", () => {
    expect(localDateISO("America/Sao_Paulo", at("2026-09-26T02:59:59Z"))).toBe(
      "2026-09-25",
    );
    expect(localDateISO("America/Sao_Paulo", at("2026-09-26T03:00:00Z"))).toBe(
      "2026-09-26",
    );
  });

  it("the same instant is a different day on each side of the date line", () => {
    const t = at("2026-09-25T12:00:00Z");
    expect(localDateISO("Pacific/Kiritimati", t)).toBe("2026-09-26");
    expect(localDateISO("Pacific/Pago_Pago", t)).toBe("2026-09-25");
  });

  it("the app's day-change timer fires within a minute after midnight", () => {
    const now = at("2026-09-26T02:58:00Z").getTime(); // 23:58 in São Paulo
    const ms = msUntilDateChange(
      now,
      "America/Sao_Paulo",
      "2026-09-25",
      localDateISO,
    );
    expect(ms).toBeGreaterThanOrEqual(2 * MIN);
    expect(ms).toBeLessThanOrEqual(3 * MIN + 1000);
  });
});

describe("DST", () => {
  it("spring forward (New York, 8 Mar 2026): a 23-hour day still ends at local midnight", () => {
    // 23:30 EST on 7 Mar = 04:30Z; the date changes at 05:00Z.
    const now = at("2026-03-08T04:30:00Z").getTime();
    const ms = msUntilDateChange(
      now,
      "America/New_York",
      "2026-03-07",
      localDateISO,
    );
    expect(ms).toBeGreaterThanOrEqual(30 * MIN);
    expect(ms).toBeLessThanOrEqual(31 * MIN + 1000);
    expect(localDateISO("America/New_York", at("2026-03-08T07:30:00Z"))).toBe(
      "2026-03-08",
    ); // 03:30 EDT, after the skipped hour
  });

  it("fall back (New York, 1 Nov 2026): the 25-hour day is one date, found by the timer", () => {
    // 00:30 EDT on 1 Nov = 04:30Z; the next midnight is 00:00 EST on 2 Nov = 05:00Z.
    const now = at("2026-11-01T04:30:00Z").getTime();
    const ms = msUntilDateChange(
      now,
      "America/New_York",
      "2026-11-01",
      localDateISO,
    );
    expect(ms).toBeGreaterThanOrEqual(24.5 * 60 * MIN);
    expect(ms).toBeLessThanOrEqual(24.5 * 60 * MIN + MIN + 1000);
    // The repeated 01:30 hour belongs to the same date both times.
    expect(localDateISO("America/New_York", at("2026-11-01T05:30:00Z"))).toBe(
      "2026-11-01",
    );
    expect(localDateISO("America/New_York", at("2026-11-01T06:30:00Z"))).toBe(
      "2026-11-01",
    );
  });

  it("calendar arithmetic never drifts across DST (dates are UTC-midnight based)", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-10-31", 2)).toBe("2026-11-02");
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
  });
});

describe("week boundary", () => {
  it("Sunday belongs to the week that started on Monday; Monday starts a new one", () => {
    expect(weekStartOf("2026-09-27")).toBe("2026-09-21"); // Sunday
    expect(weekStartOf("2026-09-28")).toBe("2026-09-28"); // Monday
  });
});

describe("month and year end", () => {
  it("31 Dec → 1 Jan", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(monthRange("2026-12")).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
  });

  it("ISO weeks across the new year (2026 has 53 weeks)", () => {
    expect(isoWeekNumber("2026-12-31")).toBe(53);
    expect(isoWeekNumber("2027-01-01")).toBe(53);
    expect(isoWeekNumber("2027-01-04")).toBe(1);
    expect(isoWeekNumber("2026-01-01")).toBe(1);
  });

  it("YEAR progress restarts on 1 Jan; the series still covers 90 days back", () => {
    expect(rangeFrom("Y", "2027-01-01")).toBe("2027-01-01");
    expect(seriesFrom("2027-01-01")).toBe("2026-10-04");
  });

  it("leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(monthRange("2028-02").to).toBe("2028-02-29");
    expect(monthRange("2027-02").to).toBe("2027-02-28");
  });
});

describe("closed-history errors are friendly", () => {
  it("never shows the database code", () => {
    expect(
      taskErrorMessage({ message: "LI_HISTORY_LOCKED", code: "P0001" }),
    ).toBe("That day is closed. Its record can't change.");
    expect(taskErrorMessage({ message: "LI_FUTURE_TASK", code: "P0001" })).toBe(
      "Refresh and try again.",
    );
    expect(
      taskErrorMessage({ message: "LI_ROUTINE_STALE", code: "P0001" }),
    ).toBe("Refresh and try again.");
  });
});
