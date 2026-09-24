import { describe, expect, it } from "vitest";
import {
  activeSeconds,
  clockOffset,
  focusErrorMessage,
  focusTodaySeconds,
  isExpired,
  isFocusing,
  partnerStatus,
  remainingSeconds,
  type FocusTimes,
} from "@/lib/focus";
import { formatClock } from "@/lib/format";

const T0 = Date.parse("2026-09-24T10:00:00Z");
const min = (n: number) => n * 60_000;
const at = (ms: number) => new Date(ms).toISOString();

const session = (over: Partial<FocusTimes> = {}): FocusTimes => ({
  status: "active",
  started_at: at(T0),
  planned_seconds: 50 * 60,
  paused_at: null,
  accumulated_pause_seconds: 0,
  ...over,
});

describe("timer maths", () => {
  it("50 min session, 10 min in: 40:00 left (a refresh does not reset it)", () => {
    expect(activeSeconds(session(), T0 + min(10))).toBe(600);
    expect(formatClock(remainingSeconds(session(), T0 + min(10)))).toBe(
      "40:00",
    );
  });

  it("paused: the clock stops at paused_at, however long the app stays closed", () => {
    const paused = session({ status: "paused", paused_at: at(T0 + min(20)) });
    expect(remainingSeconds(paused, T0 + min(20))).toBe(30 * 60);
    expect(remainingSeconds(paused, T0 + min(20) + 2 * 3600_000)).toBe(30 * 60);
  });

  it("pauses are excluded: 10:00 start, pause 10:10-10:20, end 10:40 = 30 min focus", () => {
    const resumed = session({ accumulated_pause_seconds: 600 });
    expect(activeSeconds(resumed, T0 + min(40))).toBe(1800);
  });

  it("never goes below 00:00 and knows when it expired", () => {
    const s = session({ planned_seconds: 25 * 60 });
    expect(remainingSeconds(s, T0 + min(40))).toBe(0);
    expect(isExpired(s, T0 + min(40))).toBe(true);
    expect(isExpired(s, T0 + min(24))).toBe(false);
    expect(
      isExpired(
        session({ status: "paused", paused_at: at(T0 + min(24)) }),
        T0 + min(99),
      ),
    ).toBe(false);
  });

  it("completed sessions report the stored duration", () => {
    expect(
      activeSeconds(
        { ...session({ status: "completed" }), actual_focus_seconds: 1934 },
        T0,
      ),
    ).toBe(1934);
  });

  it("estimates the server clock offset from a row the database just wrote", () => {
    // Device 30 s behind: server wrote at 10:00:30 while the device saw 10:00:00 ± 100 ms.
    expect(clockOffset(at(T0 + 30_000), T0 - 100, T0 + 100)).toBe(30_000);
  });
});

describe("partner status", () => {
  it("persistent focus wins; presence decides the rest", () => {
    const active = session();
    const now = T0 + min(5);
    expect(partnerStatus(true, null, now)).toBe("online");
    expect(partnerStatus(true, active, now)).toBe("focusing");
    expect(partnerStatus(false, active, now)).toBe("focusing"); // app closed, session still valid
    expect(partnerStatus(false, null, now)).toBe("offline");
    expect(partnerStatus(true, active, T0 + min(60))).toBe("online"); // ran out
    expect(
      isFocusing(
        session({ status: "paused", paused_at: at(now) }),
        T0 + min(90),
      ),
    ).toBe(true);
  });
});

describe("focus today", () => {
  const done = (start: number, seconds: number) => ({
    ...session({ status: "completed", started_at: at(start) }),
    actual_focus_seconds: seconds,
  });

  it("sums completed sessions and the running one for the local day", () => {
    const tz = "America/Sao_Paulo"; // UTC-3: T0 = 07:00 local on 2026-09-24
    const sessions = [
      done(T0, 3000),
      done(T0 + min(60), 1934),
      {
        ...session({ started_at: at(T0 + min(120)) }),
        actual_focus_seconds: null,
      },
      done(T0 - 12 * 3600_000, 1500), // 2026-09-23 local: not today
    ];
    expect(focusTodaySeconds(sessions, "2026-09-24", tz, T0 + min(130))).toBe(
      3000 + 1934 + 600,
    );
  });

  it("a session across midnight stays with the day it started", () => {
    const tz = "UTC";
    const lateNight = {
      ...session({ started_at: "2026-09-24T23:50:00Z" }),
      actual_focus_seconds: null,
    };
    expect(
      focusTodaySeconds(
        [lateNight],
        "2026-09-24",
        tz,
        Date.parse("2026-09-25T00:20:00Z"),
      ),
    ).toBe(1800);
    expect(
      focusTodaySeconds(
        [lateNight],
        "2026-09-25",
        tz,
        Date.parse("2026-09-25T00:20:00Z"),
      ),
    ).toBe(0);
  });
});

describe("errors", () => {
  it("maps database errors to friendly copy", () => {
    expect(focusErrorMessage("LI_FOCUS_RUNNING", "x")).toBe(
      "You already have a Focus session running.",
    );
    expect(
      focusErrorMessage(
        'new row violates check constraint "focus_sessions_planned"',
        "Could not start Focus.",
      ),
    ).toBe("Could not start Focus.");
    expect(focusErrorMessage("TypeError: fetch failed", "x")).toMatch(
      /Network/,
    );
  });
});
