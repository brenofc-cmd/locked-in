import { describe, expect, it } from "vitest";
import { formatClock, formatMinutes } from "@/lib/format";
import { mockPartner } from "@/lib/mock-data";
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
    reacted: null,
  },
  {
    id: "2",
    t: "08:02",
    who: "me",
    kind: "done",
    text: "completed Gym",
    target: "Gym",
    taskId: "b",
    reacted: null,
  },
  {
    id: "3",
    t: "09:27",
    who: "partner",
    kind: "done",
    text: "completed Morning Run",
    target: "Morning Run",
    taskId: "c",
    reacted: null,
  },
];
const online = { ...mockPartner, status: "online" as const };

describe("partner view", () => {
  it("shows online with real counts and the partner's latest completion", () => {
    const pv = partnerView(online, { done: 7, total: 11 }, feed, 0);
    expect(pv).toMatchObject({ label: "ONLINE", pct: 64, done: 7, total: 11 });
    expect(pv.line).toBe("09:27 · Completed Morning Run");
  });

  it("counts down while focusing from the shared start, without per-second updates", () => {
    const now = 1_000_000;
    const focusing = partnerView(
      {
        ...online,
        status: "focusing",
        focusLabel: "Mathematics",
        focusEnd: now + (34 * 60 + 21) * 1000,
      },
      { done: 0, total: 0 },
      feed,
      now,
    );
    expect(focusing.label).toBe("FOCUSING");
    expect(focusing.line).toBe("Mathematics · 34:21");
    const noEnd = partnerView(
      { ...online, status: "focusing", focusLabel: "Reading", focusEnd: 0 },
      { done: 0, total: 0 },
      feed,
      now,
    );
    expect(noEnd.line).toBe("Reading");
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
