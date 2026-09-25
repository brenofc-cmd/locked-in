import { describe, expect, it } from "vitest";
import { formatClock, formatMinutes } from "@/lib/format";
import type { Partner } from "@/types";
import { partnerView } from "@/lib/partner";
import type { FeedEvent } from "@/types";

const feed: FeedEvent[] = [
  {
    id: "1",
    t: "07:51",
    who: "partner",
    kind: "done",
    text: "completed Reading",
    target: "Reading",
    taskId: "a",
  },
  {
    id: "2",
    t: "08:02",
    who: "me",
    kind: "done",
    text: "completed Gym",
    target: "Gym",
    taskId: "b",
  },
  {
    id: "3",
    t: "09:27",
    who: "partner",
    kind: "done",
    text: "completed Morning Run",
    target: "Morning Run",
    taskId: "c",
  },
];
const online: Partner = {
  name: "Lucas",
  handle: "",
  initial: "L",
  status: "online",
  focusLabel: "",
  focusSession: null,
  seenAt: "",
  flashAt: 0,
  streak: 8,
};

describe("partner view", () => {
  it("shows online with real counts and the partner's latest completion", () => {
    const pv = partnerView(online, { done: 7, total: 11 }, feed, 0);
    expect(pv).toMatchObject({ label: "ONLINE", pct: 64, done: 7, total: 11 });
    expect(pv.line).toBe("09:27 · Completed Morning Run");
  });

  it("counts down from the partner's persistent session, never from streamed ticks", () => {
    const start = Date.parse("2026-09-24T12:00:00Z");
    const session = {
      status: "active",
      started_at: new Date(start).toISOString(),
      planned_seconds: 50 * 60,
      paused_at: null,
      accumulated_pause_seconds: 0,
    };
    const at = start + (15 * 60 + 39) * 1000; // 15:39 in -> 34:21 left
    const focusing = partnerView(
      {
        ...online,
        status: "focusing",
        focusLabel: "Mathematics",
        focusSession: session,
      },
      { done: 0, total: 0 },
      feed,
      at,
    );
    expect(focusing.label).toBe("FOCUSING");
    expect(focusing.line).toBe("Mathematics · 34:21");

    // Paused 2 minutes later: the clock stays where the pause happened.
    const paused = partnerView(
      {
        ...online,
        status: "focusing",
        focusLabel: "Mathematics",
        focusSession: {
          ...session,
          status: "paused",
          paused_at: new Date(at).toISOString(),
        },
      },
      { done: 0, total: 0 },
      feed,
      at + 120_000,
    );
    expect(paused.line).toBe("Mathematics · paused 34:21");

    // Private session: no title, only that they are focusing.
    const privateFocus = partnerView(
      { ...online, status: "focusing", focusLabel: "", focusSession: session },
      { done: 0, total: 0 },
      feed,
      at,
    );
    expect(privateFocus.line).toBe("Focus · 34:21");
    expect(privateFocus.statusLine).toBe("Focusing · 34:21 left");
  });

  it("offline has no last seen", () => {
    const off = partnerView(
      { ...online, status: "offline" },
      { done: 1, total: 2 },
      feed,
      0,
    );
    expect(off).toMatchObject({
      label: "OFFLINE",
      statusLine: "Offline",
      live: false,
      pct: 50,
    });
    expect(off.statusLine).not.toMatch(/seen/i);
  });

  it("handles an empty day", () => {
    expect(partnerView(online, { done: 0, total: 0 }, [], 0)).toMatchObject({
      pct: 0,
      line: "",
    });
  });
});

describe("format", () => {
  it("formats minutes and clocks", () => {
    expect(formatMinutes(70)).toBe("1h 10m");
    expect(formatMinutes(42)).toBe("42m");
    expect(formatClock(50 * 60 - 1)).toBe("49:59");
    expect(formatClock(90 * 60)).toBe("90:00");
    expect(formatClock(2061)).toBe("34:21");
  });
});
