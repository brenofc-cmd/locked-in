import { describe, expect, it } from "vitest";
import {
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

describe("focus — effective minutes", () => {
  it("compares whole minutes (what the screen shows)", () => {
    expect(
      focusOutcome(side({ focusSeconds: 119 }), side({ focusSeconds: 60 })),
    ).toBe("tie");
    expect(
      focusOutcome(side({ focusSeconds: 120 }), side({ focusSeconds: 119 })),
    ).toBe("me");
  });
  it("one minute against nothing decides", () => {
    expect(
      focusOutcome(side({ focusSeconds: 0 }), side({ focusSeconds: 60 })),
    ).toBe("partner");
  });
  it("0 vs 0 (or under a minute each) is insufficient", () => {
    expect(focusOutcome(side(), side())).toBe("insufficient");
    expect(
      focusOutcome(side({ focusSeconds: 59 }), side({ focusSeconds: 30 })),
    ).toBe("insufficient");
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
        { planned: 2, completed: 1, focusSeconds: 60 },
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

describe("category values", () => {
  it("shows the numbers that decided it", () => {
    expect(categoryValue("execution", side({ planned: 4, completed: 3 }))).toBe(
      "3/4 · 75%",
    );
    expect(categoryValue("execution", side())).toBe("sem tarefas");
    expect(categoryValue("focus", side({ focusSeconds: 1500 }))).toBe("25 min");
    expect(
      categoryValue("consistency", side({ planned: 5, completed: 4 })),
    ).toBe("bateu");
    expect(
      categoryValue("consistency", side({ planned: 5, completed: 3 })),
    ).toBe("não bateu");
    expect(categoryValue("consistency", side())).toBe("sem tarefas");
  });
});
