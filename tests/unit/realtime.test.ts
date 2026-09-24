import { describe, expect, it } from "vitest";
import {
  FEED_LIMIT,
  aggregatePresence,
  connectionFrom,
  eventFromActivity,
  mergeFeed,
  removeFromFeed,
  type LiveEvent,
  type PresenceMeta,
} from "@/lib/realtime-model";

const ME = "me-id";
const LUCAS = "lucas-id";

describe("presence aggregation", () => {
  it("no presence at all means offline", () => {
    expect(aggregatePresence({}, LUCAS).status).toBe("offline");
    expect(aggregatePresence({ [LUCAS]: [] }, LUCAS).status).toBe("offline");
  });

  it("several tabs of the same user are one online user", () => {
    const tab: PresenceMeta = { user_id: LUCAS, state: "online" };
    expect(aggregatePresence({ [LUCAS]: [tab, tab] }, LUCAS).status).toBe(
      "online",
    );
    // One tab closed: still online.
    expect(aggregatePresence({ [LUCAS]: [tab] }, LUCAS).status).toBe("online");
  });

  it("focusing in any tab wins over online, with the countdown end from start + minutes", () => {
    const state = {
      [LUCAS]: [
        { user_id: LUCAS, state: "online" as const },
        {
          user_id: LUCAS,
          state: "focusing" as const,
          focus_title: "Physics",
          focus_started_at: "2026-09-24T12:00:00.000Z",
          focus_planned_minutes: 50,
        },
      ],
    };
    expect(aggregatePresence(state, LUCAS)).toEqual({
      status: "focusing",
      focusTitle: "Physics",
      focusEnd: Date.parse("2026-09-24T12:50:00.000Z"),
    });
  });

  it("ignores other users' presence", () => {
    expect(
      aggregatePresence({ [ME]: [{ user_id: ME, state: "online" }] }, LUCAS)
        .status,
    ).toBe("offline");
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
      text: "completed Task t1",
      t: "09:27",
      taskId: "t1",
    });
    expect(
      eventFromActivity(row("e2", ME, "t2", "2026-09-24T12:27:00Z"), ME, "UTC")
        .who,
    ).toBe("me");
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
      reacted: null,
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
