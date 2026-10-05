import { describe, expect, it } from "vitest";
import { decideDuel, type DuelRow, type DuelSide } from "@/lib/duel";
import {
  MIN_OFFICIAL_DAYS,
  buildMonths,
  championName,
  decideMonth,
  lastDayOfMonth,
  monthAria,
  monthExecution,
  monthHeadline,
  monthScore,
  monthTitle,
  tiebreakLine,
  type Month,
} from "@/lib/monthly";

const side = (s: Partial<DuelSide> = {}): DuelSide => ({
  planned: 0,
  completed: 0,
  standard: 80,
  focusSeconds: 0,
  focusRunning: false,
  ...s,
});
const row = (
  date: string,
  me: Partial<DuelSide>,
  partner: Partial<DuelSide>,
  isFinal = true,
): DuelRow => ({ date, isFinal, me: side(me), partner: side(partner) });

// Day shapes (decided by the existing Daily Duel rules).
const meWins = (date: string, isFinal = true) =>
  row(
    date,
    { planned: 2, completed: 2 },
    { planned: 2, completed: 1 },
    isFinal,
  ); // 2–0
const partnerWins = (date: string, isFinal = true) =>
  row(
    date,
    { planned: 2, completed: 1 },
    { planned: 2, completed: 2 },
    isFinal,
  );
const draw = (date: string, isFinal = true) =>
  row(
    date,
    { planned: 2, completed: 2 },
    { planned: 2, completed: 2 },
    isFinal,
  ); // exec tie, consistency tie
const nothing = (date: string, isFinal = true) => row(date, {}, {}, isFinal); // insufficient

const month = (rows: DuelRow[]) => buildMonths(rows)[0];

describe("daily duels → month: only FINAL days count", () => {
  it("wins, draws and insufficient days are counted apart", () => {
    const m = month([
      meWins("2026-09-01"),
      meWins("2026-09-02"),
      partnerWins("2026-09-03"),
      draw("2026-09-04"),
      nothing("2026-09-05"),
    ]);
    expect(m.me.wins).toBe(2);
    expect(m.partner.wins).toBe(1);
    expect(m.draws).toBe(1);
    expect(m.insufficientDays).toBe(1);
    expect(m.officialDays).toBe(4);
  });

  it("a non-final day (today, open for one side) never counts", () => {
    const m = month([
      meWins("2026-10-01"),
      meWins("2026-10-02"),
      meWins("2026-10-03"),
      partnerWins("2026-10-04", false),
      partnerWins("2026-10-05", false),
    ]);
    expect(m.partner.wins).toBe(0);
    expect(m.openDays).toBe(2);
    expect(m.final).toBe(false);
  });

  it("each day is decided exactly like the Daily Duel (decideDuel)", () => {
    const days = [
      row(
        "2026-09-01",
        { planned: 3, completed: 2, focusSeconds: 60 },
        { planned: 0, focusSeconds: 59 },
      ),
      row(
        "2026-09-02",
        { planned: 1, completed: 1, standard: 100 },
        { planned: 4, completed: 3, standard: 70 },
      ),
      row("2026-09-03", { focusSeconds: 0 }, { focusSeconds: 0 }),
      row(
        "2026-09-04",
        { planned: 5, completed: 4, focusSeconds: 10 },
        { planned: 5, completed: 4, focusSeconds: 20 },
      ),
    ];
    const m = month(days);
    const outcomes = days.map((d) => decideDuel(d).outcome);
    expect(m.me.wins).toBe(outcomes.filter((o) => o === "me").length);
    expect(m.partner.wins).toBe(outcomes.filter((o) => o === "partner").length);
    expect(m.draws).toBe(outcomes.filter((o) => o === "tie").length);
    expect(m.insufficientDays).toBe(
      outcomes.filter((o) => o === "insufficient").length,
    );
  });
});

describe("minimum evidence", () => {
  it("needs 3 official days — fewer is SEM RESULTADO SUFICIENTE, also live", () => {
    expect(MIN_OFFICIAL_DAYS).toBe(3);
    const two = month([
      meWins("2026-09-01"),
      meWins("2026-09-02"),
      nothing("2026-09-03"),
      nothing("2026-09-30"),
    ]);
    expect(two.officialDays).toBe(2);
    expect(two.leader).toBeNull();
    expect(two.decidedBy).toBe("insufficient");
    expect(two.state).toBe("insufficient");
    expect(monthHeadline(two, "Matheus")).toBe(
      "SEM RESULTADO SUFICIENTE NO MÊS",
    );
    const live = month([
      meWins("2026-10-01"),
      meWins("2026-10-02"),
      nothing("2026-10-05", false),
    ]);
    expect(live.leader).toBeNull();
    expect(monthHeadline(live, "Matheus")).toBe(
      "SEM RESULTADO SUFICIENTE AINDA",
    );
  });

  it("insufficient days do not reach the minimum; draws do", () => {
    const m = month([
      draw("2026-09-01"),
      draw("2026-09-02"),
      draw("2026-09-03"),
      nothing("2026-09-30"),
    ]);
    expect(m.officialDays).toBe(3);
    expect(m.leader).toBe("draw");
  });
});

describe("decision: wins, then execution, then focus, then draw", () => {
  const base = (
    me: Partial<Month["me"]>,
    partner: Partial<Month["partner"]>,
  ) => ({
    me: { wins: 5, completed: 0, planned: 0, focusSeconds: 0, ...me },
    partner: { wins: 5, completed: 0, planned: 0, focusSeconds: 0, ...partner },
    officialDays: 12,
  });

  it("more daily wins wins", () => {
    expect(decideMonth(base({ wins: 12 }, { wins: 9 }))).toEqual({
      leader: "me",
      decidedBy: "daily_wins",
    });
    expect(decideMonth(base({ wins: 2 }, { wins: 3 }))).toEqual({
      leader: "partner",
      decidedBy: "daily_wins",
    });
  });

  it("tied wins → monthly execution, exact (never the rounded %)", () => {
    // 7/8 = 87.5 % vs 6/7 = 85.7 %: 49 > 48 by cross-multiplication.
    expect(
      decideMonth(
        base({ completed: 7, planned: 8 }, { completed: 6, planned: 7 }),
      ),
    ).toEqual({
      leader: "me",
      decidedBy: "execution",
    });
    // 667/1000 vs 2/3: both "67 %", exact ratio still decides.
    expect(
      decideMonth(
        base({ completed: 667, planned: 1000 }, { completed: 2, planned: 3 }),
      ),
    ).toEqual({
      leader: "me",
      decidedBy: "execution",
    });
  });

  it("execution tied (equal ratios) → effective focus seconds, exact", () => {
    expect(
      decideMonth(
        base(
          { completed: 1, planned: 2, focusSeconds: 3600 },
          { completed: 2, planned: 4, focusSeconds: 3601 },
        ),
      ),
    ).toEqual({ leader: "partner", decidedBy: "focus" });
  });

  it("execution not comparable (no day where both had tasks) → focus decides", () => {
    expect(
      decideMonth(base({ focusSeconds: 10 }, { focusSeconds: 9 })),
    ).toEqual({ leader: "me", decidedBy: "focus" });
  });

  it("everything equal → EMPATE DO MÊS, no fourth tiebreak", () => {
    expect(
      decideMonth(
        base(
          { completed: 3, planned: 4, focusSeconds: 60 },
          { completed: 3, planned: 4, focusSeconds: 60 },
        ),
      ),
    ).toEqual({
      leader: "draw",
      decidedBy: "draw",
    });
  });

  it("execution sums only the FINAL days where both had tasks", () => {
    const m = month([
      meWins("2026-09-01"),
      partnerWins("2026-09-02"),
      draw("2026-09-03"),
      // Only I had tasks: 10/10 must not inflate my execution.
      row("2026-09-04", { planned: 10, completed: 10 }, {}),
      nothing("2026-09-30"),
    ]);
    expect(m.me).toMatchObject({ completed: 5, planned: 6 });
    expect(m.partner).toMatchObject({ completed: 5, planned: 6 });
  });

  it("focus sums every FINAL day of the month", () => {
    const m = month([
      row("2026-09-01", { focusSeconds: 100 }, { focusSeconds: 1 }),
      row("2026-09-02", { focusSeconds: 5 }, { focusSeconds: 50 }),
      row("2026-09-03", { focusSeconds: 7 }, {}, false),
    ]);
    expect(m.me.focusSeconds).toBe(105);
    expect(m.partner.focusSeconds).toBe(51);
  });
});

describe("live vs final", () => {
  const eight = (prefix: string, isFinal = true) => [
    meWins(`${prefix}-01`, isFinal),
    meWins(`${prefix}-02`, isFinal),
    meWins(`${prefix}-03`, isFinal),
    partnerWins(`${prefix}-04`, isFinal),
  ];

  it("a month is live until its last calendar day is FINAL — never a champion", () => {
    const m = month([...eight("2026-10"), nothing("2026-10-05", false)]);
    expect(m.final).toBe(false);
    expect(m.state).toBe("live");
    expect(m.leader).toBe("me");
    expect(monthHeadline(m, "Matheus")).toBe("VOCÊ ESTÁ NA FRENTE");
    expect(championName(m, "Matheus")).toBeNull();
    expect(monthHeadline({ ...m, leader: "partner" }, "Matheus")).toBe(
      "MATHEUS ESTÁ NA FRENTE",
    );
    expect(monthHeadline({ ...m, leader: "draw" }, "Matheus")).toBe(
      "EMPATADOS",
    );
  });

  it("final when the last day is FINAL: CAMPEÃO DE <MÊS>", () => {
    const m = month([...eight("2026-09"), nothing("2026-09-30")]);
    expect(m.final).toBe(true);
    expect(m.state).toBe("final");
    expect(monthHeadline(m, "Matheus")).toBe("CAMPEÃO DE SETEMBRO");
    expect(championName(m, "Matheus")).toBe("VOCÊ");
    const p = month([
      partnerWins("2026-09-01"),
      partnerWins("2026-09-02"),
      draw("2026-09-03"),
      nothing("2026-09-30"),
    ]);
    expect(championName(p, "Matheus")).toBe("MATHEUS");
    const d = month([
      draw("2026-09-01"),
      draw("2026-09-02"),
      draw("2026-09-30"),
    ]);
    expect(monthHeadline(d, "Matheus")).toBe("EMPATE DO MÊS");
  });

  it("the last day still open for the partner (behind in time) keeps the month live", () => {
    const m = month([...eight("2026-09"), nothing("2026-09-30", false)]);
    expect(m.final).toBe(false);
    expect(monthHeadline(m, "Matheus")).toBe("VOCÊ ESTÁ NA FRENTE");
  });

  it("a duo formed mid-month counts only its days", () => {
    const m = month([
      meWins("2026-09-20"),
      meWins("2026-09-21"),
      partnerWins("2026-09-22"),
      nothing("2026-09-30"),
    ]);
    expect(m.officialDays).toBe(3);
    expect(m.final).toBe(true);
    expect(m.leader).toBe("me");
  });
});

describe("months, year boundary, labels", () => {
  it("31/12 and 01/01 belong to different months and years, newest first", () => {
    const ms = buildMonths([
      meWins("2027-01-01", false),
      partnerWins("2026-12-31"),
      partnerWins("2026-12-30"),
      partnerWins("2026-12-29"),
    ]);
    expect(ms.map((m) => m.month)).toEqual(["2027-01-01", "2026-12-01"]);
    expect(ms[1]).toMatchObject({ final: true, leader: "partner" });
    expect(ms[0]).toMatchObject({ final: false, leader: null });
    expect(monthTitle(ms[0].month)).toBe("JANEIRO 2027");
    expect(monthTitle(ms[1].month)).toBe("DEZEMBRO 2026");
  });

  it("last day of each month (leap years too)", () => {
    expect(lastDayOfMonth("2026-02-01")).toBe("2026-02-28");
    expect(lastDayOfMonth("2028-02-01")).toBe("2028-02-29");
    expect(lastDayOfMonth("2026-09-01")).toBe("2026-09-30");
    expect(lastDayOfMonth("2026-12-01")).toBe("2026-12-31");
  });

  it("score, tiebreak line, execution and the screen-reader sentence", () => {
    const m = month([
      meWins("2026-09-01"),
      partnerWins("2026-09-02"),
      draw("2026-09-03"),
      row(
        "2026-09-30",
        { planned: 2, completed: 2, focusSeconds: 10 },
        { planned: 2, completed: 2 },
      ),
    ]);
    // 09-30: execution and consistency tie, focus is mine → my day (1–0).
    expect(monthScore(m)).toBe("2 — 1");
    const tied: Month = {
      ...m,
      me: { ...m.me, wins: 1 },
      partner: { ...m.partner, wins: 1 },
      decidedBy: "execution",
      leader: "me",
    };
    expect(tiebreakLine(tied)).toBe("Desempate: execução mensal");
    expect(tiebreakLine({ ...tied, decidedBy: "focus" })).toBe(
      "Desempate: foco mensal",
    );
    expect(tiebreakLine({ ...tied, decidedBy: "daily_wins" })).toBeNull();
    expect(
      monthExecution({ wins: 0, completed: 88, planned: 100, focusSeconds: 0 }),
    ).toBe("88% · 88/100");
    expect(
      monthExecution({ wins: 0, completed: 0, planned: 0, focusSeconds: 0 }),
    ).toBe("—");
    const live: Month = {
      ...tied,
      final: false,
      decidedBy: "daily_wins",
      me: { ...tied.me, wins: 8 },
      partner: { ...tied.partner, wins: 5 },
    };
    expect(monthAria(live, "Brendon", "Matheus")).toBe(
      "SETEMBRO 2026, AO VIVO: Brendon lidera Matheus por 8 vitórias a 5.",
    );
    expect(
      monthAria({ ...live, leader: "partner" }, "Brendon", "Matheus"),
    ).toBe(
      "SETEMBRO 2026, AO VIVO: Matheus lidera Brendon por 5 vitórias a 8.",
    );
  });
});
