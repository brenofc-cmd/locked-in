import { describe, expect, it } from "vitest";
import {
  FEED_LIMIT,
  connectionFrom,
  eventFromActivity,
  focusMinutes,
  mergeFeed,
  presenceOnline,
  removeFromFeed,
  type LiveEvent,
  type PresenceMeta,
} from "@/lib/realtime-model";

const ME = "me-id";
const LUCAS = "lucas-id";

describe("presence", () => {
  it("no presence entry means offline", () => {
    expect(presenceOnline({}, LUCAS)).toBe(false);
    expect(presenceOnline({ [LUCAS]: [] }, LUCAS)).toBe(false);
  });

  it("several tabs of the same user are one online user", () => {
    const tab: PresenceMeta = { user_id: LUCAS, state: "online" };
    expect(presenceOnline({ [LUCAS]: [tab, tab] }, LUCAS)).toBe(true);
    expect(presenceOnline({ [LUCAS]: [tab] }, LUCAS)).toBe(true); // one tab closed
  });

  it("ignores other users", () => {
    expect(
      presenceOnline({ [ME]: [{ user_id: ME, state: "online" }] }, LUCAS),
    ).toBe(false);
  });
});

const row = (id: string, actor: string, target: string, at: string) => ({
  id,
  actor_id: actor,
  target_id: target,
  title: `Task ${target}`,
  created_at: at,
});

describe("activity feed", () => {
  it("maps rows to feed lines in the viewer's timezone", () => {
    const e = eventFromActivity(
      row("e1", LUCAS, "t1", "2026-09-24T12:27:00Z"),
      ME,
      "America/Sao_Paulo",
    );
    expect(e).toMatchObject({
      who: "partner",
      kind: "done",
      text: "concluiu Task t1",
      t: "09:27",
      taskId: "t1",
    });
    expect(
      eventFromActivity(row("e2", ME, "t2", "2026-09-24T12:27:00Z"), ME, "UTC")
        .who,
    ).toBe("me");
  });

  it("maps focus events; a private session stays generic; minutes are real", () => {
    const base = {
      id: "f1",
      actor_id: LUCAS,
      target_id: "s1",
      created_at: "2026-09-24T12:00:00Z",
    };
    expect(
      eventFromActivity(
        { ...base, event_type: "focus_started", title: "Project" },
        ME,
        "UTC",
      ),
    ).toMatchObject({
      kind: "focus",
      text: "iniciou Foco — Project",
    });
    expect(
      eventFromActivity(
        { ...base, event_type: "focus_started", title: null },
        ME,
        "UTC",
      ).text,
    ).toBe("iniciou Foco");
    expect(
      eventFromActivity(
        {
          ...base,
          id: "f2",
          event_type: "focus_completed",
          title: "Project",
          duration_seconds: 1934,
        },
        ME,
        "UTC",
      ),
    ).toMatchObject({ kind: "focusdone", text: "concluiu 32 min de Foco" });
    expect(focusMinutes(3)).toBe("<1 min");
  });

  it("keeps started and completed lines of the same session", () => {
    const base = { actor_id: LUCAS, target_id: "s1", title: "Project" };
    const started = eventFromActivity(
      {
        ...base,
        id: "a",
        event_type: "focus_started",
        created_at: "2026-09-24T12:00:00Z",
      },
      ME,
      "UTC",
    );
    const done = eventFromActivity(
      {
        ...base,
        id: "b",
        event_type: "focus_completed",
        duration_seconds: 600,
        created_at: "2026-09-24T12:10:00Z",
      },
      ME,
      "UTC",
    );
    expect(
      mergeFeed(mergeFeed([], [started]), [done]).map((e) => e.id),
    ).toEqual(["a", "b"]);
  });

  it("never duplicates an event delivered twice (reconnect / refetch)", () => {
    const e = eventFromActivity(
      row("e1", LUCAS, "t1", "2026-09-24T12:00:00Z"),
      ME,
      "UTC",
    );
    const feed = mergeFeed(mergeFeed([], [e]), [e, e]);
    expect(feed).toHaveLength(1);
  });

  it("replaces my optimistic line with the real event for the same task", () => {
    const local: LiveEvent = {
      id: "local-t9",
      at: "2026-09-24T12:00:00Z",
      t: "12:00",
      who: "me",
      kind: "done",
      text: "completed Gym",
      target: "Gym",
      taskId: "t9",
    };
    const real = eventFromActivity(
      row("e9", ME, "t9", "2026-09-24T12:00:01Z"),
      ME,
      "UTC",
    );
    const feed = mergeFeed([local], [real]);
    expect(feed.map((e) => e.id)).toEqual(["e9"]);
  });

  it("orders oldest first and keeps the last 20", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      eventFromActivity(
        row(
          `e${i}`,
          LUCAS,
          `t${i}`,
          new Date(Date.UTC(2026, 8, 24, 8, i)).toISOString(),
        ),
        ME,
        "UTC",
      ),
    );
    const feed = mergeFeed([], [...many].reverse());
    expect(feed).toHaveLength(FEED_LIMIT);
    expect(feed[0].id).toBe("e5");
    expect(feed.at(-1)!.id).toBe("e24");
  });

  it("removes an undone completion by event id or task id", () => {
    const a = eventFromActivity(
      row("e1", LUCAS, "t1", "2026-09-24T08:00:00Z"),
      ME,
      "UTC",
    );
    const b = eventFromActivity(
      row("e2", ME, "t2", "2026-09-24T09:00:00Z"),
      ME,
      "UTC",
    );
    expect(removeFromFeed([a, b], { id: "e1" }).map((e) => e.id)).toEqual([
      "e2",
    ]);
    expect(removeFromFeed([a, b], { taskId: "t2" }).map((e) => e.id)).toEqual([
      "e1",
    ]);
  });
});

describe("connection state", () => {
  it("maps channel status to the three UI states", () => {
    expect(connectionFrom("SUBSCRIBED", true)).toBe("connected");
    expect(connectionFrom("CONNECTING", true)).toBe("connected");
    expect(connectionFrom("CHANNEL_ERROR", true)).toBe("reconnecting");
    expect(connectionFrom("TIMED_OUT", true)).toBe("reconnecting");
    expect(connectionFrom("CLOSED", true)).toBe("reconnecting");
    expect(connectionFrom("SUBSCRIBED", false)).toBe("offline");
  });
});
