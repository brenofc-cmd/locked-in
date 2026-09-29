import { describe, expect, it } from "vitest";
import { lastSeen, lastSeenText, partnerView } from "@/lib/partner";
import type { Partner } from "@/types";

const SP = "America/Sao_Paulo"; // UTC-3, no DST
const at = (iso: string) => Date.parse(iso);
/** 2026-09-29 15:00 in São Paulo. */
const NOW = at("2026-09-29T18:00:00Z");

const text = (seenISO: string, now = NOW, tz = SP) => {
  const s = lastSeen(seenISO, now, tz);
  return s ? lastSeenText(s) : null;
};

describe("last seen label (viewer's timezone)", () => {
  it("now: under a minute, and a clock slightly ahead", () => {
    expect(text("2026-09-29T17:59:30Z")).toBe("Visto por último agora");
    expect(text("2026-09-29T18:00:20Z")).toBe("Visto por último agora");
  });

  it("minutes ago, 1–59", () => {
    expect(text("2026-09-29T17:59:00Z")).toBe("Visto por último há 1 min");
    expect(text("2026-09-29T17:48:00Z")).toBe("Visto por último há 12 min");
    expect(text("2026-09-29T17:00:01Z")).toBe("Visto por último há 59 min");
  });

  it("today at HH:mm after an hour", () => {
    expect(text("2026-09-29T10:32:00Z")).toBe("Visto por último hoje às 07:32");
  });

  it("yesterday at HH:mm", () => {
    expect(text("2026-09-29T02:18:00Z")).toBe(
      "Visto por último ontem às 23:18",
    );
  });

  it("older: DD/MM at HH:mm", () => {
    expect(text("2026-09-28T00:40:00Z")).toBe(
      "Visto por último em 27/09 às 21:40",
    );
  });

  it("midnight boundary in the viewer's timezone, not UTC", () => {
    // 00:30 local on the 29th = 03:30Z; viewed at 01:45 local (04:45Z).
    const now = at("2026-09-29T04:45:00Z");
    expect(text("2026-09-29T03:30:00Z", now)).toBe(
      "Visto por último hoje às 00:30",
    );
    // 23:50 local on the 28th = 02:50Z on the 29th (already the 29th in UTC).
    expect(text("2026-09-29T02:50:00Z", now)).toBe(
      "Visto por último ontem às 23:50",
    );
  });

  it("timezone: the same instant reads differently for different viewers", () => {
    const seen = "2026-09-29T02:18:00Z";
    expect(text(seen, NOW, "UTC")).toBe("Visto por último hoje às 02:18");
    expect(text(seen, NOW, SP)).toBe("Visto por último ontem às 23:18");
    // Tokyo (UTC+9) is already on the 30th at NOW.
    expect(text(seen, NOW, "Asia/Tokyo")).toBe(
      "Visto por último ontem às 11:18",
    );
  });

  it("year and month edges", () => {
    const now = at("2027-01-01T15:00:00Z"); // 12:00 local, 1 Jan
    expect(text("2027-01-01T02:59:00Z", now)).toBe(
      "Visto por último ontem às 23:59",
    );
    expect(text("2026-12-30T12:00:00Z", now)).toBe(
      "Visto por último em 30/12 às 09:00",
    );
  });

  it("compact form", () => {
    const s = lastSeen("2026-09-29T17:48:00Z", NOW, SP)!;
    expect(lastSeenText(s, true)).toBe("visto há 12 min");
  });

  it("nothing for an empty or invalid value", () => {
    expect(lastSeen("", NOW, SP)).toBeNull();
    expect(lastSeen("not a date", NOW, SP)).toBeNull();
  });
});

describe("unified partner status", () => {
  const base: Partner = {
    name: "Lucas",
    handle: "",
    initial: "L",
    status: "offline",
    focusLabel: "",
    focusSession: null,
    seenAt: "2026-09-29T17:48:00Z",
    flashAt: 0,
    streak: null,
  };
  const counts = { done: 1, total: 4 };

  it("OFFLINE shows the last seen", () => {
    const v = partnerView(base, counts, [], NOW, SP);
    expect(v).toMatchObject({
      label: "OFFLINE",
      statusLine: "Visto por último há 12 min",
      seen: "visto há 12 min",
      live: false,
    });
  });

  it("ONLINE wins over a last seen (never ONLINE from last seen alone)", () => {
    const v = partnerView({ ...base, status: "online" }, counts, [], NOW, SP);
    expect(v.label).toBe("ONLINE");
    expect(v.seen).toBe("");
    const recent = partnerView(
      { ...base, seenAt: "2026-09-29T17:59:59Z" },
      counts,
      [],
      NOW,
      SP,
    );
    expect(recent.label).toBe("OFFLINE");
  });

  it("FOCUS wins over presence and last seen", () => {
    const v = partnerView(
      {
        ...base,
        status: "focusing",
        focusLabel: "Física",
        focusSession: {
          status: "running",
          started_at: "2026-09-29T17:30:00Z",
          planned_seconds: 3000,
          paused_at: null,
          accumulated_pause_seconds: 0,
        },
      },
      counts,
      [],
      NOW,
      SP,
    );
    expect(v.label).toBe("EM FOCO");
    expect(v.seen).toBe("");
    expect(v.statusLine).not.toMatch(/Visto/);
  });
});
