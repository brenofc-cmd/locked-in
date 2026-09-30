import { describe, expect, it } from "vitest";
import {
  NUDGE_COOLDOWN_MS,
  accountabilityErrorMessage,
  commitmentFromRow,
  currentCheckin,
  daySummary,
  effectiveStatus,
  historyDays,
  kindLine,
  nudgeBlock,
  nudgeCooldownLeft,
  partnerProjection,
  proofLine,
  validateCommitmentDraft,
  type Commitment,
  type CommitmentRow,
  type NudgeRow,
} from "@/lib/accountability";
import { eventFromActivity, isProofKind } from "@/lib/realtime-model";
import { t } from "@/i18n/pt-BR";

const ME = "00000000-0000-4000-8000-00000000000a";
const PARTNER = "00000000-0000-4000-8000-00000000000b";

function row(over: Partial<CommitmentRow> = {}): CommitmentRow {
  return {
    id: "c1",
    owner_id: PARTNER,
    commit_date: "2026-09-30",
    title: "Treinar hoje",
    kind: "task",
    focus_target_seconds: null,
    standard_percent: null,
    status: "active",
    resolution: null,
    proof_kind: null,
    proven_at: null,
    cancelled_at: null,
    created_at: "2026-09-30T10:00:00Z",
    closed: false,
    ...over,
  };
}
const c = (over: Partial<CommitmentRow> = {}) =>
  commitmentFromRow(row(over)) as Commitment;

const NOW = Date.parse("2026-09-30T15:00:00Z");
const nudge = (over: Partial<NudgeRow> = {}): NudgeRow => ({
  id: "n1",
  from_user: ME,
  to_user: PARTNER,
  commitment_id: "c1",
  recipient_date: "2026-09-30",
  created_at: "2026-09-30T14:00:00Z",
  ...over,
});

describe("commitment state", () => {
  it("MISSED is an ACTIVE commitment of a closed day, derived", () => {
    expect(effectiveStatus("active", false)).toBe("active");
    expect(effectiveStatus("active", true)).toBe("missed");
    expect(effectiveStatus("missed", true)).toBe("missed");
  });
  it("PROVEN and CANCELLED are final, closed or not", () => {
    expect(effectiveStatus("proven", true)).toBe("proven");
    expect(effectiveStatus("cancelled", true)).toBe("cancelled");
    expect(effectiveStatus("cancelled", false)).toBe("cancelled");
  });
  it("maps a row and ignores proof fields unless proven", () => {
    const x = c({ status: "active", proof_kind: "task", proven_at: "x" });
    expect(x.proofKind).toBeNull();
    expect(x.provenAt).toBeNull();
    const p = c({
      status: "proven",
      resolution: "verified",
      proof_kind: "task",
      proven_at: "2026-09-30T12:54:00Z",
    });
    expect(p).toMatchObject({ status: "proven", resolution: "verified" });
  });
  it("drops an unknown kind", () => {
    expect(commitmentFromRow(row({ kind: "milestone" }))).toBeNull();
  });
});

describe("proof resolution (display)", () => {
  it("verified proof shows its generic kind and time in the viewer's zone", () => {
    const p = c({
      status: "proven",
      resolution: "verified",
      proof_kind: "task",
      proven_at: "2026-09-30T12:54:00Z",
    });
    expect(proofLine(p, "America/Sao_Paulo")).toBe(
      t.accountability.proofLine(t.accountability.proofKinds.task, "09:54"),
    );
  });
  it("self-declared is always labelled AUTODECLARADO", () => {
    const p = c({
      kind: "simple",
      status: "proven",
      resolution: "self_declared",
      proof_kind: "self",
      proven_at: "2026-09-30T21:10:00Z",
    });
    expect(proofLine(p, "UTC")).toContain(t.accountability.proofKinds.self);
  });
  it("no proof line while not proven", () => {
    expect(proofLine(c(), "UTC")).toBeNull();
    expect(proofLine(c({ closed: true }), "UTC")).toBeNull();
  });
  it("kind line shows the target, never a source", () => {
    expect(kindLine(c({ kind: "focus", focus_target_seconds: 3600 }))).toBe(
      t.accountability.kindFocus(60),
    );
    expect(kindLine(c({ kind: "standard", standard_percent: 80 }))).toBe(
      t.accountability.kindStandard(80),
    );
  });
});

describe("privacy projection", () => {
  it("keeps only title, status, proof kind / time, resolution and date", () => {
    const leaky = {
      ...c({
        status: "proven",
        resolution: "verified",
        proof_kind: "task",
        proven_at: "t",
      }),
      daily_task_id: "secret-task",
      goal_id: "secret-goal",
      goal_title: "Passar no vestibular",
    } as Commitment & Record<string, unknown>;
    const p = partnerProjection(leaky);
    expect(Object.keys(p).sort()).toEqual(
      [
        "date",
        "id",
        "proofKind",
        "provenAt",
        "resolution",
        "status",
        "title",
      ].sort(),
    );
    expect(JSON.stringify(p)).not.toMatch(/secret|vestibular/);
  });
});

describe("nudge availability (mirrors guard_nudge)", () => {
  it("never on my own commitment", () => {
    expect(nudgeBlock(c({ owner_id: ME }), ME, [], NOW)).toBe("self");
  });
  it("never on PROVEN / MISSED / CANCELLED", () => {
    expect(nudgeBlock(c({ status: "proven" }), ME, [], NOW)).toBe("closed");
    expect(nudgeBlock(c({ status: "cancelled" }), ME, [], NOW)).toBe("closed");
    expect(nudgeBlock(c({ closed: true }), ME, [], NOW)).toBe("closed");
  });
  it("one per commitment every 2 hours", () => {
    expect(nudgeBlock(c(), ME, [nudge()], NOW)).toBe("cooldown");
    const old = nudge({
      created_at: new Date(NOW - NUDGE_COOLDOWN_MS - 1).toISOString(),
    });
    expect(nudgeBlock(c(), ME, [old], NOW)).toBeNull();
    expect(nudgeCooldownLeft("c1", ME, [nudge()], NOW)).toBe(60 * 60 * 1000);
    expect(nudgeCooldownLeft("c1", ME, [old], NOW)).toBe(0);
  });
  it("at most 3 per recipient day to the same partner", () => {
    const three = ["a", "b", "c"].map((id) =>
      nudge({
        id,
        commitment_id: `other-${id}`,
        created_at: "2026-09-30T01:00:00Z",
      }),
    );
    expect(nudgeBlock(c(), ME, three, NOW)).toBe("limit");
    // Another recipient day does not count (recipient's timezone).
    const yesterday = three.map((n) => ({
      ...n,
      recipient_date: "2026-09-29",
    }));
    expect(nudgeBlock(c(), ME, yesterday, NOW)).toBeNull();
    // The partner's nudges to me do not count against mine.
    const theirs = three.map((n) => ({
      ...n,
      from_user: PARTNER,
      to_user: ME,
    }));
    expect(nudgeBlock(c(), ME, theirs, NOW)).toBeNull();
  });
});

describe("check-in and summaries", () => {
  const rows = [
    {
      user_id: ME,
      local_date: "2026-09-30",
      state: "HARD_DAY",
      created_at: "2026-09-30T08:00:00Z",
    },
    {
      user_id: ME,
      local_date: "2026-09-30",
      state: "LOCKED_IN",
      created_at: "2026-09-30T09:00:00Z",
    },
    {
      user_id: ME,
      local_date: "2026-09-29",
      state: "NEED_ACCOUNTABILITY",
      created_at: "2026-09-29T09:00:00Z",
    },
  ];
  it("the latest of the day is current; other days never leak in", () => {
    expect(currentCheckin(rows, ME, "2026-09-30")).toBe("LOCKED_IN");
    expect(currentCheckin(rows, ME, "2026-10-01")).toBeNull();
    expect(currentCheckin(rows, PARTNER, "2026-09-30")).toBeNull();
    expect(currentCheckin(rows, ME, null)).toBeNull();
  });
  it("summary ignores cancelled commitments", () => {
    const list = [
      c({
        id: "a",
        status: "proven",
        resolution: "self_declared",
        proof_kind: "self",
        kind: "simple",
        proven_at: "t",
      }),
      c({ id: "b" }),
      c({ id: "d", status: "cancelled", cancelled_at: "t" }),
    ];
    expect(daySummary(list)).toEqual({
      total: 2,
      proven: 1,
      active: 1,
      missed: 0,
      selfDeclared: 1,
    });
  });
  it("history holds closed days only, newest first", () => {
    const list = [
      c({ id: "a", commit_date: "2026-09-28", closed: true }),
      c({
        id: "b",
        commit_date: "2026-09-29",
        closed: true,
        status: "proven",
        resolution: "verified",
        proof_kind: "task",
        proven_at: "t",
      }),
      c({
        id: "x",
        commit_date: "2026-09-29",
        closed: true,
        status: "cancelled",
        cancelled_at: "t",
      }),
      c({ id: "today", commit_date: "2026-09-30" }),
    ];
    const h = historyDays(list);
    expect(h.map((d) => d.date)).toEqual(["2026-09-29", "2026-09-28"]);
    expect(h[1].items[0].status).toBe("missed");
    expect(h[0].items.map((i) => i.id)).toEqual(["b"]);
  });
});

describe("validation and errors", () => {
  const base = {
    title: "Ler 20 páginas",
    kind: "simple" as const,
    taskId: null,
    focusMinutes: null,
  };
  it("validates the draft", () => {
    expect(validateCommitmentDraft(base)).toBeNull();
    expect(validateCommitmentDraft({ ...base, title: "   " })).toBe(
      t.accountability.errors.titleRequired,
    );
    expect(validateCommitmentDraft({ ...base, title: "x".repeat(81) })).toBe(
      t.accountability.errors.titleTooLong,
    );
    expect(validateCommitmentDraft({ ...base, kind: "task" })).toBe(
      t.accountability.errors.pickTask,
    );
    expect(
      validateCommitmentDraft({ ...base, kind: "focus", focusMinutes: 4 }),
    ).toBe(t.accountability.errors.focusRange);
    expect(
      validateCommitmentDraft({ ...base, kind: "focus", focusMinutes: 60 }),
    ).toBeNull();
  });
  it("maps database codes to fixed copy, never the raw message", () => {
    expect(accountabilityErrorMessage("LI_NUDGE_COOLDOWN")).toBe(
      t.accountability.errors.nudgeCooldown,
    );
    expect(accountabilityErrorMessage("LI_NUDGE_LIMIT")).toBe(
      t.accountability.errors.nudgeLimit,
    );
    expect(accountabilityErrorMessage("duplicate key value violates…")).toBe(
      t.accountability.errors.generic,
    );
  });
});

describe("feed", () => {
  it("a proven commitment is a reactable feed line with its public title", () => {
    const e = eventFromActivity(
      {
        id: "e1",
        actor_id: PARTNER,
        event_type: "commitment_proven",
        target_id: "c1",
        title: "Treinar hoje",
        created_at: "2026-09-30T12:54:00Z",
      },
      ME,
      "UTC",
    );
    expect(e).toMatchObject({ kind: "commit", who: "partner", taskId: "c1" });
    expect(e.text).toBe(t.feed.commitmentProven("Treinar hoje"));
    expect(isProofKind(e.kind)).toBe(true);
  });
  it("self-declared says so", () => {
    const e = eventFromActivity(
      {
        id: "e2",
        actor_id: PARTNER,
        event_type: "commitment_self_declared",
        target_id: "c2",
        title: "Ligar pra mãe",
        created_at: "2026-09-30T12:54:00Z",
      },
      ME,
      "UTC",
    );
    expect(e.text).toBe(t.feed.commitmentSelfDeclared("Ligar pra mãe"));
  });
});
