export const pad2 = (n: number) => String(n).padStart(2, "0");

/** Current wall-clock time as "HH:MM". */
export function nowHM(date: Date = new Date()): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 94 → "1h 34m", 42 → "42m". */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${pad2(m)}m` : `${m}m`;
}

/** Seconds → "MM:SS" (minutes may exceed 59, e.g. "90:00"). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}

/** Deterministic pseudo-random generator for stable mock charts. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
