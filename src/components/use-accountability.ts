"use client";

/**
 * Duo Accountability 2.0 (V2 Phase 6, docs/ACCOUNTABILITY.md): commitments,
 * nudges and check-ins of the current duo. Postgres decides every status and
 * limit; this hook re-reads through RLS after a realtime change
 * (accountabilityVersion: commitment_changed / nudge_received /
 * checkin_changed / refetch) and after my own completions. Never on a clock:
 * a running focus sends nothing (Stage 6) — a focus proof arrives through
 * commitment_changed when the session completes. No polling. Nudges and check-ins are optimistic; commitments are re-read.
 */
import { t } from "@/i18n/pt-BR";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createCommitment,
  loadAccountability,
  sendNudge,
  setCheckin,
  setCommitmentStatus,
  type AccountabilityData,
} from "@/app/(app)/accountability-actions";
import {
  HISTORY_DAYS,
  commitmentFromRow,
  currentCheckin,
  historyDays,
  type CheckinState,
  type Commitment,
  type CommitmentDraft,
} from "@/lib/accountability";
import type { Toast } from "@/types";

type Result = { ok: true } | { ok: false; error: string };

export function useAccountability({
  myId,
  partner,
  today,
  version,
  doneToday,
  toast,
}: {
  myId: string;
  partner: { id: string; name: string; timezone: string } | null;
  today: string;
  version: number;
  doneToday: number;
  toast: (t: Omit<Toast, "id"> & { id?: string }) => void;
}) {
  const [data, setData] = useState<AccountabilityData | null>(null);
  const [error, setError] = useState(false);
  /** Commitment ids with a write in flight (buttons disabled meanwhile). */
  const [busy, setBusy] = useState<string[]>([]);
  const seq = useRef(0);
  const partnerId = partner?.id ?? null;
  const partnerTz = partner?.timezone ?? null;

  const reload = useCallback(async () => {
    if (!partnerId || !partnerTz) return;
    const mine = ++seq.current;
    const res = await loadAccountability(today, HISTORY_DAYS, {
      id: partnerId,
      timezone: partnerTz,
    }).catch(() => null);
    if (mine !== seq.current) return; // a newer read is on its way
    if (res?.ok) {
      setData(res.data);
      setError(false);
    } else setError(true);
  }, [today, partnerId, partnerTz]);

  // No duo: nothing to show (and never another duo's rows).
  const [shownPartner, setShownPartner] = useState(partnerId);
  if (shownPartner !== partnerId) {
    setShownPartner(partnerId);
    setData(null);
  }

  useEffect(() => {
    if (!partnerId) return;
    const id = setTimeout(() => void reload(), 250);
    return () => clearTimeout(id);
  }, [reload, partnerId, version, doneToday]);

  const commitments = useMemo(
    () =>
      (data?.commitments ?? [])
        .map(commitmentFromRow)
        .filter((c): c is Commitment => c !== null),
    [data],
  );
  // Open = the owner's day is still open (the database says so per owner).
  const mine = commitments.filter(
    (c) => c.ownerId === myId && !c.closed && c.status !== "cancelled",
  );
  const theirs = commitments.filter(
    (c) => c.ownerId === partnerId && !c.closed && c.status !== "cancelled",
  );
  const history = useMemo(() => historyDays(commitments), [commitments]);
  const nudges = useMemo(() => data?.nudges ?? [], [data]);
  const checkins = data?.checkins ?? [];

  const withBusy = useCallback(
    async (id: string, run: () => Promise<Result | null>) => {
      setBusy((b) => [...b, id]);
      const res = await run().catch(() => null);
      setBusy((b) => b.filter((x) => x !== id));
      if (!res?.ok)
        toast({
          text: res && !res.ok ? res.error : t.hookToasts.networkTryAgain,
          sub: t.accountability.commitments,
        });
      void reload();
      return res;
    },
    [reload, toast],
  );

  const create = useCallback(
    async (draft: CommitmentDraft): Promise<Result> => {
      const res = await createCommitment(draft).catch(() => null);
      if (res?.ok) void reload();
      return res ?? { ok: false, error: t.errors.network };
    },
    [reload],
  );

  const setStatus = useCallback(
    (c: Commitment, status: "cancelled" | "proven" | "active") =>
      withBusy(c.id, () => setCommitmentStatus(c.id, status)),
    [withBusy],
  );

  const nudge = useCallback(
    async (c: Commitment) => {
      const local = {
        id: `local-${c.id}`,
        from_user: myId,
        to_user: c.ownerId,
        commitment_id: c.id,
        recipient_date: c.date,
        created_at: new Date().toISOString(),
      };
      setData((d) => (d ? { ...d, nudges: [local, ...d.nudges] } : d));
      const res = await withBusy(c.id, () => sendNudge(c.id));
      if (res?.ok && partner)
        toast({
          text: t.accountability.nudgeSent(partner.name),
          sub: c.title.toUpperCase(),
          rook: "tap",
        });
    },
    [myId, partner, toast, withBusy],
  );

  const checkin = useCallback(
    async (state: CheckinState) => {
      const local = {
        user_id: myId,
        local_date: today,
        state,
        created_at: new Date().toISOString(),
      };
      setData((d) => (d ? { ...d, checkins: [local, ...d.checkins] } : d));
      await withBusy("checkin", () => setCheckin(state));
    },
    [myId, today, withBusy],
  );

  return {
    loaded: data !== null,
    error,
    reload,
    commitments,
    mine,
    theirs,
    history,
    nudges,
    busy,
    myCheckin: currentCheckin(checkins, myId, today),
    partnerCheckin: partnerId
      ? currentCheckin(checkins, partnerId, data?.partnerDate ?? null)
      : null,
    partnerFocusSeconds: data?.partnerFocusSeconds ?? 0,
    create,
    cancel: (c: Commitment) => setStatus(c, "cancelled"),
    declare: (c: Commitment, done: boolean) =>
      setStatus(c, done ? "proven" : "active"),
    nudge,
    checkin,
  };
}

export type Accountability = ReturnType<typeof useAccountability>;
