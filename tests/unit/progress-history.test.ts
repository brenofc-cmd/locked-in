// @vitest-environment node
/**
 * Progress history: a month before the loaded series is read on demand with
 * loadDays() (ProgressScreen → calendar). The dates are validated as
 * YYYY-MM-DD before any database call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));

const { loadDays } = await import("@/app/(app)/progress-actions");

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({
    data: [
      {
        day: "2026-05-04",
        planned: 4,
        completed: 3,
        focus_seconds: 1500,
        focus_sessions: 1,
      },
    ],
    error: null,
  });
});

describe("loadDays (historical month outside the loaded series)", () => {
  it("reads a past month by its YYYY-MM-DD bounds", async () => {
    const res = await loadDays("2026-05-01", "2026-05-31");
    expect(rpc).toHaveBeenCalledWith("my_daily_progress", {
      p_from: "2026-05-01",
      p_to: "2026-05-31",
    });
    expect(res).toEqual({
      ok: true,
      days: [
        {
          day: "2026-05-04",
          planned: 4,
          completed: 3,
          focusSeconds: 1500,
          focusSessions: 1,
        },
      ],
    });
  });

  it.each([
    ["dddd-dd-dd", "2026-05-31"],
    ["2026-05-01", "dddd-dd-dd"],
    ["2026-5-1", "2026-05-31"],
    ["2026-05-01T00:00", "2026-05-31"],
    ["", "2026-05-31"],
  ])("refuses %s → %s without calling the database", async (from, to) => {
    const res = await loadDays(from, to);
    expect(res.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
