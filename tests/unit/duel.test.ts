import { describe, expect, it } from "vitest";
import {
  categoryShare,
  categoryValue,
  consistencyOutcome,
  decideDuel,
  duelHeadline,
  duelPhase,
  duelScore,
  executionOutcome,
  focusOutcome,
  liveDuels,
  standardState,
  withRunning,
  type DuelRow,
  type DuelSide,
} from "@/lib/duel";
import { standardMet } from "@/lib/progress";

const side = (s: Partial<DuelSide> = {}): DuelSide => ({
  planned: 0,
  completed: 0,
  standard: 80,
  focusSeconds: 0,
  focusRunning: false,
  ...s,
});
const row = (
  me: Partial<DuelSide>,
  partner: Partial<DuelSide>,
  isFinal = true,
  date = "2026-09-30",
): DuelRow => ({ date, isFinal, me: side(me), partner: side(partner) });

describe("execution — completion ratio, exact", () => {
  it("higher ratio wins", () => {
    expect(
      executionOutcome(
        side({ planned: 4, completed: 3 }),
        side({ planned: 2, completed: 1 }),
      ),
    ).toBe("me");
    expect(
      executionOutcome(
        side({ planned: 4, completed: 1 }),
        side({ planned: 2, completed: 1 }),
      ),
    ).toBe("partner");
  });
  it("equal ratios tie even with different counts", () => {
    expect(
      executionOutcome(
        side({ planned: 3, completed: 2 }),
        side({ planned: 6, completed: 4 }),
      ),
    ).toBe("tie");
  });
  it("compares the exact ratio, not the rounded %", () => {
    // 1/3 = 33.33 % vs 33/100 = 33 %: both round to 33 %, 1/3 is higher.
    expect(
      executionOutcome(
        side({ planned: 3, completed: 1 }),
        side({ planned: 100, completed: 33 }),
      ),
    ).toBe("me");
  });
  it("needs tasks on both sides (skipped stays in planned)", () => {
    expect(
      executionOutcome(
        side({ planned: 0 }),
        side({ planned: 2, completed: 2 }),
      ),
    ).toBe("insufficient");
    expect(
      executionOutcome(
        side({ planned: 2, completed: 2 }),
        side({ planned: 0 }),
      ),
    ).toBe("insufficient");
    expect(executionOutcome(side(), side())).toBe("insufficient");
  });
});

describe("focus — effective seconds, exact", () => {
  it("more real focus wins, to the second", () => {
    expect(
      focusOutcome(side({ focusSeconds: 120 }), side({ focusSeconds: 119 })),
    ).toBe("me");
    expect(
      focusOutcome(side({ focusSeconds: 59 }), side({ focusSeconds: 30 })),
    ).toBe("me");
    expect(
      focusOutcome(side({ focusSeconds: 1500 }), side({ focusSeconds: 1500 })),
    ).toBe("tie");
  });
  it("any focus against none decides", () => {
    expect(
      focusOutcome(side({ focusSeconds: 0 }), side({ focusSeconds: 1 })),
    ).toBe("partner");
  });
  it("0 vs 0 is neutral (not comparable), never a tie", () => {
    expect(focusOutcome(side(), side())).toBe("insufficient");
  });
  it("0 vs 0 focus never counts as a decided category", () => {
    // Execution tied, Consistency tied, no focus at all: the day is a tie
    // decided by two categories only — the empty Focus adds nothing.
    const d = decideDuel(
      row({ planned: 2, completed: 2 }, { planned: 4, completed: 4 }),
    );
    expect(d.categories.map((c) => c.outcome)).toEqual([
      "tie",
      "insufficient",
      "tie",
    ]);
    // Execution decided, Consistency tied (both met), focus 0×0 adds nothing:
    const one = decideDuel(
      row(
        { planned: 2, completed: 2 },
        { planned: 2, completed: 1, standard: 50 },
      ),
    );
    expect(one.categories[1].outcome).toBe("insufficient");
    expect(one.score).toEqual({ me: 1, partner: 0 });
  });
});

describe("consistency — the existing Daily Standard", () => {
  const met = side({ planned: 5, completed: 4, standard: 80 }); // exactly 80 %
  const notMet = side({ planned: 5, completed: 3, standard: 80 });
  const neutral = side({ planned: 0 });

  it("uses exactly standardMet (no new formula)", () => {
    for (const s of [
      met,
      notMet,
      side({ planned: 3, completed: 1, standard: 34 }),
      side({ planned: 3, completed: 1, standard: 33 }),
    ])
      expect(standardState(s) === "met").toBe(
        standardMet(s.planned, s.completed, s.standard),
      );
    expect(standardState(neutral)).toBe("neutral");
  });
  it("each side against their own standard", () => {
    const lowBar = side({ planned: 10, completed: 5, standard: 50 });
    const highBar = side({ planned: 10, completed: 8, standard: 90 });
    expect(consistencyOutcome(lowBar, highBar)).toBe("me");
  });
  it("official table", () => {
    expect(consistencyOutcome(met, notMet)).toBe("me");
    expect(consistencyOutcome(notMet, met)).toBe("partner");
    expect(consistencyOutcome(met, met)).toBe("tie");
    expect(consistencyOutcome(notMet, notMet)).toBe("tie");
    expect(consistencyOutcome(neutral, met)).toBe("insufficient");
    expect(consistencyOutcome(notMet, neutral)).toBe("insufficient");
    expect(consistencyOutcome(neutral, neutral)).toBe("insufficient");
  });
});

describe("result of the day", () => {
  it("more categories won wins (2–1)", () => {
    const d = decideDuel(
      row(
        { planned: 4, completed: 4, focusSeconds: 0 },
        { planned: 4, completed: 3, focusSeconds: 1800 },
      ),
    );
    expect(d.categories.map((c) => c.outcome)).toEqual(["me", "partner", "me"]);
    expect(d.score).toEqual({ me: 2, partner: 1 });
    expect(d.outcome).toBe("me");
    expect(duelScore(d)).toBe("2–1");
  });
  it("one decided category is enough (1–0)", () => {
    const d = decideDuel(row({ focusSeconds: 600 }, {}));
    expect(d.outcome).toBe("me");
    expect(d.score).toEqual({ me: 1, partner: 0 });
  });
  it("equal categories won is a tie", () => {
    const d = decideDuel(
      row(
        { planned: 2, completed: 2, focusSeconds: 0 },
        { planned: 2, completed: 1, focusSeconds: 600 },
        true,
      ),
    );
    // execution me, focus partner, consistency: me MET (100 %), partner NOT_MET (50 % < 80 %) → me.
    expect(d.outcome).toBe("me");
    const tie = decideDuel(
      row(
        { planned: 2, completed: 2, focusSeconds: 0, standard: 50 },
        { planned: 2, completed: 1, focusSeconds: 600, standard: 50 },
      ),
    );
    expect(tie.categories.map((c) => c.outcome)).toEqual([
      "me",
      "partner",
      "tie",
    ]);
    expect(tie.outcome).toBe("tie");
    expect(duelScore(tie)).toBe("1–1");
  });
  it("all categories tied is a tie", () => {
    const d = decideDuel(
      row(
        { planned: 2, completed: 1, focusSeconds: 90 },
        { planned: 4, completed: 2, focusSeconds: 90 },
      ),
    );
    expect(d.outcome).toBe("tie");
  });
  it("nothing decided is insufficient", () => {
    const d = decideDuel(row({ planned: 3, completed: 3 }, {}));
    expect(d.categories.every((c) => c.outcome === "insufficient")).toBe(true);
    expect(d.outcome).toBe("insufficient");
    expect(duelScore(d)).toBe("");
  });
});

describe("live vs final wording", () => {
  const winning = row(
    { planned: 2, completed: 2 },
    { planned: 2, completed: 1 },
  );
  it("live never says anyone won", () => {
    const live = decideDuel({ ...winning, isFinal: false });
    expect(duelPhase(live)).toBe("AO VIVO");
    expect(duelHeadline(live, "Beto")).toBe("VOCÊ ESTÁ NA FRENTE");
    const behind = decideDuel({
      ...winning,
      isFinal: false,
      me: winning.partner,
      partner: winning.me,
    });
    expect(duelHeadline(behind, "Beto")).toBe("BETO ESTÁ NA FRENTE");
    for (const d of [live, behind])
      expect(duelHeadline(d, "Beto")).not.toMatch(/VENC/);
    expect(duelHeadline(decideDuel(row({}, {}, false)), "Beto")).toBe(
      "SEM RESULTADO SUFICIENTE",
    );
    expect(
      duelHeadline(
        decideDuel(row({ focusSeconds: 60 }, { focusSeconds: 60 }, false)),
        "Beto",
      ),
    ).toBe("EMPATE");
  });
  it("final says who won the day", () => {
    const d = decideDuel(winning);
    expect(duelPhase(d)).toBe("RESULTADO FINAL");
    expect(duelHeadline(d, "Beto")).toBe("VOCÊ VENCEU O DIA");
    expect(
      duelHeadline(
        decideDuel({ ...winning, me: winning.partner, partner: winning.me }),
        "Beto",
      ),
    ).toBe("BETO VENCEU O DIA");
    expect(duelHeadline(decideDuel(row({}, {})), "Beto")).toBe(
      "SEM RESULTADO SUFICIENTE",
    );
  });
});

describe("live numbers", () => {
  const T0 = Date.parse("2026-10-01T12:00:00Z");
  const running = {
    status: "active",
    started_at: "2026-10-01T11:50:00Z",
    planned_seconds: 3600,
    paused_at: null,
    accumulated_pause_seconds: 0,
  };
  it("adds the running session only where the database flagged it", () => {
    expect(
      withRunning(side({ focusSeconds: 600, focusRunning: true }), running, T0)
        .focusSeconds,
    ).toBe(1200);
    expect(
      withRunning(side({ focusSeconds: 600 }), running, T0).focusSeconds,
    ).toBe(600);
    expect(
      withRunning(side({ focusSeconds: 600, focusRunning: true }), null, T0)
        .focusSeconds,
    ).toBe(600);
  });
  it("a paused session counts up to the pause", () => {
    const paused = {
      ...running,
      status: "paused",
      paused_at: "2026-10-01T11:55:00Z",
    };
    expect(
      withRunning(side({ focusRunning: true }), paused, T0).focusSeconds,
    ).toBe(300);
  });
  it("today: my side is live from the screen and never final", () => {
    const rows = [
      row(
        { planned: 1, completed: 0 },
        { planned: 2, completed: 1, focusSeconds: 0, focusRunning: true },
        false,
        "2026-10-01",
      ),
      row(
        { planned: 2, completed: 2 },
        { planned: 2, completed: 2 },
        true,
        "2026-09-30",
      ),
    ];
    const [today, yesterday] = liveDuels(
      rows,
      "2026-10-01",
      { planned: 3, completed: 3, standard: 80, focusSeconds: 120 },
      { me: null, partner: running },
      T0,
    );
    expect(today.me).toMatchObject({
      planned: 3,
      completed: 3,
      focusSeconds: 120,
    });
    expect(today.partner.focusSeconds).toBe(600);
    expect(today.final).toBe(false);
    expect(today.outcome).toBe("me");
    expect(duelHeadline(today, "Beto")).toBe("VOCÊ ESTÁ NA FRENTE");
    expect(yesterday.final).toBe(true);
    expect(yesterday.outcome).toBe("tie");
  });
});

describe("the Daily Standard of each day (ADR-076)", () => {
  // The database returns, per row, the standard in force that day (a closed
  // day keeps its version, an open day uses the current one). The client only
  // replaces MY side of TODAY with the screen (current standard, live tasks).
  const T0 = Date.parse("2026-10-01T12:00:00Z");
  const closed = (date: string, standard: number) =>
    row(
      { planned: 5, completed: 4, standard },
      { planned: 5, completed: 4, standard: 80 },
      true,
      date,
    );
  const mine = (standard: number) => ({
    planned: 5,
    completed: 4,
    standard,
    focusSeconds: 0,
  });

  it("a closed day keeps the version it was decided with", () => {
    // 4 / 5 = 80 %: met with 80 %, it would not be with 90 %.
    const [past] = liveDuels(
      [closed("2026-09-30", 80)],
      "2026-10-01",
      mine(90),
      { me: null, partner: null },
      T0,
    );
    expect(past.me.standard).toBe(80);
    expect(past.categories[2].outcome).toBe("tie");
    expect(past.final).toBe(true);
  });
  it("a change today applies to today's open duel only", () => {
    const rows = [
      row(
        { planned: 5, completed: 4, standard: 80 },
        { planned: 5, completed: 4 },
        false,
        "2026-10-01",
      ),
      closed("2026-09-30", 80),
    ];
    const before = liveDuels(
      rows,
      "2026-10-01",
      mine(80),
      { me: null, partner: null },
      T0,
    );
    const after = liveDuels(
      rows,
      "2026-10-01",
      mine(90),
      { me: null, partner: null },
      T0,
    );
    expect(before[0].categories[2].outcome).toBe("tie");
    expect(after[0].me.standard).toBe(90);
    expect(after[0].categories[2].outcome).toBe("partner");
    expect(after[1]).toEqual(before[1]);
  });
  it("several changes the same day: the latest is live", () => {
    const rows = [row({}, {}, false, "2026-10-01")];
    for (const v of [90, 70, 100])
      expect(
        liveDuels(
          rows,
          "2026-10-01",
          mine(v),
          { me: null, partner: null },
          T0,
        )[0].me.standard,
      ).toBe(v);
  });
  it("boundaries: only the row equal to today is live (month / year edges)", () => {
    const rows = [
      row({}, {}, false, "2027-01-01"),
      closed("2026-12-31", 80),
      closed("2026-11-30", 70),
    ];
    const out = liveDuels(
      rows,
      "2027-01-01",
      mine(95),
      { me: null, partner: null },
      T0,
    );
    expect(out.map((d) => d.me.standard)).toEqual([95, 80, 70]);
    expect(out.map((d) => d.final)).toEqual([false, true, true]);
  });
  it("timezone: 'today' is the database's local date, never the device's UTC date", () => {
    // 2026-10-01T02:00Z is still 2026-09-30 in São Paulo: the database says
    // today = 2026-09-30, so that row is live and 2026-10-01 does not exist yet.
    const rows = [row({}, {}, false, "2026-09-30"), closed("2026-09-29", 80)];
    const out = liveDuels(
      rows,
      "2026-09-30",
      mine(60),
      { me: null, partner: null },
      Date.parse("2026-10-01T02:00:00Z"),
    );
    expect(out[0].me.standard).toBe(60);
    expect(out[1].me.standard).toBe(80);
  });
});

describe("category values", () => {
  it("shows the numbers that decided it", () => {
    expect(categoryValue("execution", side({ planned: 4, completed: 3 }))).toBe(
      "3/4 · 75%",
    );
    expect(categoryValue("execution", side())).toBe("sem tarefas");
    expect(categoryValue("focus", side({ focusSeconds: 1500 }))).toBe("25 min");
    expect(categoryValue("focus", side({ focusSeconds: 1512 }))).toBe(
      "25 min 12 s",
    );
    expect(categoryValue("focus", side({ focusSeconds: 40 }))).toBe("40 s");
    expect(categoryValue("focus", side())).toBe("0 min");
    expect(
      categoryValue("consistency", side({ planned: 5, completed: 4 })),
    ).toBe("bateu");
    expect(
      categoryValue("consistency", side({ planned: 5, completed: 3 })),
    ).toBe("não bateu");
    expect(categoryValue("consistency", side())).toBe("sem tarefas");
  });
});

describe("categoryShare (V3 duel bar)", () => {
  it("splits each category by the numbers it shows", () => {
    expect(
      categoryShare(
        "execution",
        side({ planned: 4, completed: 4 }),
        side({ planned: 2, completed: 1 }),
      ),
    ).toBeCloseTo(1 / 1.5);
    expect(
      categoryShare(
        "focus",
        side({ focusSeconds: 300 }),
        side({ focusSeconds: 900 }),
      ),
    ).toBeCloseTo(0.25);
    expect(
      categoryShare(
        "consistency",
        side({ planned: 5, completed: 5 }),
        side({ planned: 5, completed: 0 }),
      ),
    ).toBe(1);
  });

  it("is null when neither side has anything (an even bar)", () => {
    expect(categoryShare("focus", side(), side())).toBeNull();
    expect(categoryShare("execution", side(), side())).toBeNull();
  });
});
