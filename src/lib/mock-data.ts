/**
 * The only remaining mock data (Stage 7): challenges (Stage 8). Product
 * constants (reactions, skip reasons, standard options) live here too.
 * Everything else — identity, duo, tasks, partner, feed, focus, streaks,
 * competition and analytics — is real (Supabase).
 */
import type { Challenge } from "@/types";

export const mockChallenges: Challenge[] = [
  {
    id: "c1",
    title: "NO ZERO DAYS",
    desc: "30 days. At least one task every day.",
    status: "ACTIVE",
    progLabel: "DAY",
    prog: "18 / 30",
    me: "94%",
    meWidth: 94,
    partner: "89%",
    partnerWidth: 89,
  },
  {
    id: "c2",
    title: "20 HOURS OF FOCUS",
    desc: "This week. First to 20 hours.",
    status: "ENDS SUN",
    progLabel: "LEADER",
    prog: "Brendon",
    me: "8h 42m",
    meWidth: 44,
    partner: "7h 18m",
    partnerWidth: 37,
  },
];

export const mockChallengeOptions = [
  { id: "zero", label: "No zero days", sub: "At least one task every day." },
  {
    id: "perfect",
    label: "Perfect week",
    sub: "Meet your standard every day.",
  },
  { id: "focus", label: "Most focus", sub: "Most focus hours wins." },
];

export const REACTIONS = ["🔥", "⚡", "🫡", "Respect."];
export const SKIP_REASONS = ["Rest", "Sick", "Travel", "Other"];
export const STANDARD_OPTIONS = [70, 80, 90, 100];
