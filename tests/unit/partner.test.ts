import { describe, expect, it } from "vitest";
import { formatClock, formatMinutes } from "@/lib/format";
import { mockActivity, mockPartner, mockPartnerTasks } from "@/lib/mock-data";
import { partnerView } from "@/lib/partner";

describe("partner view", () => {
  it("shows Lucas online at 64%, 7 / 11, latest Morning Run", () => {
    const pv = partnerView(mockPartner, mockPartnerTasks, mockActivity, 0);
    expect(pv).toMatchObject({ label: "ONLINE", pct: 64, done: 7, total: 11 });
    expect(pv.line).toBe("09:27 · Completed Morning Run");
  });

  it("counts down while focusing and shows last seen offline", () => {
    const now = 1_000_000;
    const focusing = partnerView(
      { ...mockPartner, status: "focusing", focusEnd: now + 90_000 },
      mockPartnerTasks,
      mockActivity,
      now,
    );
    expect(focusing.line).toBe("Studying Mathematics · 01:30");
    const offline = partnerView(
      { ...mockPartner, status: "offline" },
      mockPartnerTasks,
      mockActivity,
      now,
    );
    expect(offline.statusLine).toBe("Offline · Last seen 14:02");
  });
});

describe("format", () => {
  it("formats minutes and clocks", () => {
    expect(formatMinutes(70)).toBe("1h 10m");
    expect(formatMinutes(42)).toBe("42m");
    expect(formatClock(50 * 60 - 1)).toBe("49:59");
    expect(formatClock(90 * 60)).toBe("90:00");
  });
});
