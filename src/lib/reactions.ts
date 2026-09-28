/**
 * Reactions (Stage 8): the approved set only. Stored as a type key
 * (reactions.reaction_type), shown as the design's glyph or word.
 */
import { t } from "@/i18n/pt-BR";

export const REACTION_TYPES = [
  "fire",
  "lightning",
  "salute",
  "respect",
] as const;

export type ReactionType = (typeof REACTION_TYPES)[number];

const LABEL: Record<ReactionType, string> = {
  fire: "🔥",
  lightning: "⚡",
  salute: "🫡",
  respect: t.reactions.respect,
};

export const reactionLabel = (type: ReactionType) => LABEL[type];

export function isReactionType(v: unknown): v is ReactionType {
  return (
    typeof v === "string" && (REACTION_TYPES as readonly string[]).includes(v)
  );
}

/** Emoji reactions render large; "Respeito." is a word. */
export const isEmojiReaction = (type: ReactionType) => type !== "respect";

/** reactions of one event: user id -> type. */
export type EventReactions = Record<string, ReactionType>;

/** All reactions of the feed: event id -> (user id -> type). */
export type ReactionMap = Record<string, EventReactions>;

export function reactionMapFrom(
  rows: {
    activity_event_id: string;
    from_user_id: string;
    reaction_type: string;
  }[],
): ReactionMap {
  const map: ReactionMap = {};
  for (const r of rows) {
    if (!isReactionType(r.reaction_type)) continue;
    (map[r.activity_event_id] ??= {})[r.from_user_id] = r.reaction_type;
  }
  return map;
}

/** Apply one change (a broadcast or my own write); null type = removed. */
export function applyReaction(
  map: ReactionMap,
  eventId: string,
  userId: string,
  type: ReactionType | null,
): ReactionMap {
  const current = { ...(map[eventId] ?? {}) };
  if (type) current[userId] = type;
  else delete current[userId];
  const next = { ...map };
  if (Object.keys(current).length) next[eventId] = current;
  else delete next[eventId];
  return next;
}

/** Toast copy when my partner reacts to my event. */
export function reactionToastText(
  partnerName: string,
  target: string | null,
): string {
  return t.reactions.toast(partnerName, target);
}
