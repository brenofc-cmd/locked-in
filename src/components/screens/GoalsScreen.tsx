"use client";

import { t } from "@/i18n/pt-BR";
import { useEffect, useState, type ReactNode } from "react";
import {
  addMilestone,
  deleteGoalsItem,
  reorderGoalsItems,
  saveGoal,
  saveMirror,
  saveVision,
  setGoalStatus,
  setMilestoneDone,
  setMirrorActive,
  setVisionArchived,
} from "@/app/(app)/goals-actions";
import { useApp } from "@/components/app-state";
import { useResumeValue } from "@/components/resume/use-resume";
import { useSession } from "@/components/session";
import { Sheet } from "@/components/sheets/Sheet";
import { chipTone, cx } from "@/components/ui";
import {
  DESCRIPTION_MAX,
  GOAL_TYPES,
  MIRROR_MAX,
  SECTIONS,
  TITLE_MAX,
  activeMirror,
  activeVisions,
  archivedVisions,
  goalTypeLabel,
  groupGoals,
  inactiveMirror,
  milestonesLabel,
  move,
  nextSortOrder,
  targetLabel,
  validateGoal,
  validateMirror,
  validateVision,
  type Goal,
  type GoalType,
  type GoalsData,
  type MirrorItem,
  type Section,
  type Vision,
} from "@/lib/goals";
import { localDateISO } from "@/lib/local-date";
import {
  clearGoalDraft,
  loadGoalDraft,
  rememberGoalsSection,
  saveGoalDraft,
} from "@/lib/resume-state";

const monoLabel = "font-mono text-[10.5px] tracking-[.16em] text-dim";
const field =
  "rounded-xl border border-white/10 bg-bg text-text outline-none focus:border-white/30";
const h2 =
  "border-b border-white/9 pb-2 font-mono text-[11px] font-normal tracking-[.16em] text-muted";

type SheetState =
  | { kind: "vision"; item?: Vision }
  | { kind: "goal"; item?: Goal }
  | { kind: "mirror"; item?: MirrorItem };

/**
 * METAS & VISÃO (V2 Phase 3, docs/GOALS.md): direction, not daily execution.
 * Private to the owner. No percentage anywhere; milestones are a count.
 */
export function GoalsScreen({ initial }: { initial: GoalsData }) {
  const app = useApp();
  const { me } = useSession();
  const [data, setData] = useState(initial);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [picked, setPicked] = useState<Section | null>(null);
  const stored = useResumeValue(
    me.id,
    (s) => s.goals?.section,
  ) as Section | null;
  const section: Section = picked ?? stored ?? "vision";
  const pick = (s: Section) => {
    setPicked(s);
    rememberGoalsSection(me.id, s);
  };
  const notify = (text: string) => app.toast({ text, sub: t.goals.toastSub });

  const reorder = async (kind: "vision" | "goal" | "mirror", ids: string[]) => {
    const pos = new Map(ids.map((id, i) => [id, (i + 1) * 10]));
    setData((d) => ({
      visions:
        kind === "vision"
          ? d.visions.map((v) => ({
              ...v,
              sortOrder: pos.get(v.id) ?? v.sortOrder,
            }))
          : d.visions,
      goals:
        kind === "goal"
          ? d.goals.map((g) => ({
              ...g,
              sortOrder: pos.get(g.id) ?? g.sortOrder,
            }))
          : d.goals,
      mirror:
        kind === "mirror"
          ? d.mirror.map((m) => ({
              ...m,
              sortOrder: pos.get(m.id) ?? m.sortOrder,
            }))
          : d.mirror,
    }));
    const res = await reorderGoalsItems(kind, ids).catch(() => null);
    if (!res?.ok)
      notify(res && !res.ok ? res.error : t.goals.errors.saveFailed);
  };

  return (
    <div className="flex flex-col gap-7 animate-[li-fade-up_.4s_ease] desk:gap-10">
      <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em] max-[384px]:text-[23px] desk:text-[38px]">
        {t.goals.title}
      </h1>
      <div
        role="radiogroup"
        aria-label={t.goals.sectionsAria}
        className="flex self-start rounded-xl border border-white/8 p-1"
      >
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={section === s}
            onClick={() => pick(s)}
            className={cx(
              "h-9 rounded-lg px-4 font-mono text-[11px] tracking-[.14em]",
              section === s ? "bg-selected text-text" : "text-dim",
            )}
          >
            {t.goals.sections[s]}
          </button>
        ))}
      </div>

      {section === "vision" && (
        <VisionSection
          visions={data.visions}
          onAdd={() => setSheet({ kind: "vision" })}
          onOpen={(item) => setSheet({ kind: "vision", item })}
          onReorder={(ids) => void reorder("vision", ids)}
        />
      )}
      {section === "goals" && (
        <GoalsSection
          data={data}
          onAdd={() => setSheet({ kind: "goal" })}
          onOpen={(item) => setSheet({ kind: "goal", item })}
          onReorder={(ids) => void reorder("goal", ids)}
        />
      )}
      {section === "mirror" && (
        <MirrorSection
          items={data.mirror}
          onAdd={() => setSheet({ kind: "mirror" })}
          onOpen={(item) => setSheet({ kind: "mirror", item })}
          onReorder={(ids) => void reorder("mirror", ids)}
        />
      )}

      {sheet && (
        <Sheet
          label={
            sheet.kind === "vision"
              ? sheet.item
                ? t.goals.editVision
                : t.goals.newVision
              : sheet.kind === "goal"
                ? sheet.item
                  ? t.goals.editGoal
                  : t.goals.newGoal
                : sheet.item
                  ? t.goals.editMirror
                  : t.goals.newMirror
          }
          onClose={() => setSheet(null)}
        >
          {sheet.kind === "vision" && (
            <VisionForm
              item={sheet.item}
              nextOrder={nextSortOrder(data.visions)}
              onDone={(v, removed) => {
                setData((d) => ({
                  ...d,
                  visions: removed
                    ? d.visions.filter((x) => x.id !== v.id)
                    : [...d.visions.filter((x) => x.id !== v.id), v],
                  goals: removed
                    ? d.goals.map((g) =>
                        g.visionId === v.id ? { ...g, visionId: null } : g,
                      )
                    : d.goals,
                }));
                notify(removed ? t.goals.deleted : t.goals.saved);
                setSheet(null);
              }}
            />
          )}
          {sheet.kind === "goal" && (
            <GoalForm
              item={sheet.item}
              visions={[...data.visions].sort(
                (a, b) => a.sortOrder - b.sortOrder,
              )}
              nextOrder={nextSortOrder(data.goals)}
              onChange={(g) =>
                setData((d) => ({
                  ...d,
                  goals: [...d.goals.filter((x) => x.id !== g.id), g],
                }))
              }
              onDone={(g, removed) => {
                setData((d) => ({
                  ...d,
                  goals: removed
                    ? d.goals.filter((x) => x.id !== g.id)
                    : [...d.goals.filter((x) => x.id !== g.id), g],
                }));
                notify(removed ? t.goals.deleted : t.goals.saved);
                setSheet(null);
              }}
            />
          )}
          {sheet.kind === "mirror" && (
            <MirrorForm
              item={sheet.item}
              nextOrder={nextSortOrder(data.mirror)}
              onDone={(m, removed) => {
                setData((d) => ({
                  ...d,
                  mirror: removed
                    ? d.mirror.filter((x) => x.id !== m.id)
                    : [...d.mirror.filter((x) => x.id !== m.id), m],
                }));
                notify(removed ? t.goals.deleted : t.goals.saved);
                setSheet(null);
              }}
            />
          )}
        </Sheet>
      )}
    </div>
  );
}

// ------------------------------------------------------------- pieces ----

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-11 self-start rounded-xl border border-white/12 px-4 text-sm"
    >
      {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="text-[22px] leading-[1.3] font-medium tracking-[-0.02em] text-pretty text-muted">
      {text}
    </p>
  );
}

/** Keyboard-accessible move up / down (no drag library). */
function Reorder({
  ids,
  id,
  title,
  onReorder,
}: {
  ids: string[];
  id: string;
  title: string;
  onReorder: (ids: string[]) => void;
}) {
  const up = move(ids, id, -1);
  const down = move(ids, id, 1);
  const btn =
    "flex size-9 items-center justify-center rounded-lg text-dim hover:text-text disabled:opacity-25";
  return (
    <span className="flex shrink-0">
      <button
        type="button"
        aria-label={t.goals.moveUp(title)}
        disabled={!up}
        onClick={() => up && onReorder(up)}
        className={btn}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={t.goals.moveDown(title)}
        disabled={!down}
        onClick={() => down && onReorder(down)}
        className={btn}
      >
        ↓
      </button>
    </span>
  );
}

function Collapsed({
  summary,
  children,
}: {
  summary: string;
  children: ReactNode;
}) {
  return (
    <details className="group flex flex-col">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-between font-mono text-[11px] tracking-[.16em] text-dim hover:text-text">
        {summary}
        <span
          aria-hidden="true"
          className="transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="flex flex-col">{children}</div>
    </details>
  );
}

// ------------------------------------------------------------- vision ----

function VisionSection({
  visions,
  onAdd,
  onOpen,
  onReorder,
}: {
  visions: Vision[];
  onAdd: () => void;
  onOpen: (v: Vision) => void;
  onReorder: (ids: string[]) => void;
}) {
  const active = activeVisions(visions);
  const archived = archivedVisions(visions);
  const ids = active.map((v) => v.id);
  return (
    <section
      aria-label={t.goals.sections.vision}
      className="flex flex-col gap-4"
    >
      <AddButton label={t.goals.addVision} onClick={onAdd} />
      {active.length === 0 && <Empty text={t.goals.empty.vision} />}
      <ul className="flex flex-col gap-3">
        {active.map((v) => (
          <li
            key={v.id}
            className="flex items-start gap-2 rounded-2xl border border-white/7 bg-card p-4"
          >
            <button
              type="button"
              onClick={() => onOpen(v)}
              className="flex min-w-0 flex-1 flex-col gap-1.5 text-left"
            >
              <span className="text-[17px] leading-[1.35] font-medium">
                {v.title}
              </span>
              {v.description && (
                <span className="text-[14px] leading-[1.5] whitespace-pre-wrap text-muted">
                  {v.description}
                </span>
              )}
            </button>
            <Reorder
              ids={ids}
              id={v.id}
              title={v.title}
              onReorder={onReorder}
            />
          </li>
        ))}
      </ul>
      {archived.length > 0 && (
        <Collapsed summary={t.goals.archivedSection(archived.length)}>
          {archived.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onOpen(v)}
              className="min-h-[46px] border-b border-white/5 text-left text-sm text-muted"
            >
              {v.title}
            </button>
          ))}
        </Collapsed>
      )}
    </section>
  );
}

function VisionForm({
  item,
  nextOrder,
  onDone,
}: {
  item?: Vision;
  nextOrder: number;
  onDone: (v: Vision, removed?: boolean) => void;
}) {
  const { me } = useSession();
  const [draft] = useState(() =>
    item ? null : loadGoalDraft(me.id, "vision"),
  );
  const [title, setTitle] = useState(draft?.title ?? item?.title ?? "");
  const [description, setDescription] = useState(
    draft?.description ?? item?.description ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (item || done) return;
    saveGoalDraft(me.id, "vision", { title, description });
  }, [item, done, me.id, title, description]);

  async function save() {
    const invalid = validateVision({ title, description });
    if (invalid) return setError(invalid);
    setPending(true);
    const res = await saveVision(
      item?.id ?? null,
      { title, description },
      nextOrder,
    ).catch(() => null);
    setPending(false);
    if (!res?.ok)
      return setError(res && !res.ok ? res.error : t.goals.errors.saveFailed);
    if (!item) {
      setDone(true);
      clearGoalDraft(me.id, "vision");
    }
    onDone(res.vision);
  }

  async function archive() {
    if (!item) return;
    const res = await setVisionArchived(item.id, !item.archived).catch(
      () => null,
    );
    if (!res?.ok)
      return setError(res && !res.ok ? res.error : t.goals.errors.saveFailed);
    onDone(res.vision);
  }

  if (confirm && item)
    return (
      <ConfirmDelete
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          const res = await deleteGoalsItem("vision", item.id).catch(
            () => null,
          );
          if (!res?.ok)
            return setError(
              res && !res.ok ? res.error : t.goals.errors.saveFailed,
            );
          onDone(item, true);
        }}
      />
    );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) void save();
      }}
    >
      <span className="font-mono text-[11px] tracking-[.18em] text-muted">
        {item ? t.goals.editVision : t.goals.newVision}
      </span>
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setError(null);
        }}
        maxLength={TITLE_MAX}
        placeholder={t.goals.fields.visionPlaceholder}
        aria-label={t.goals.fields.title}
        className="h-14 rounded-[14px] border border-white/12 bg-bg px-4 text-[17px] outline-none focus:border-white/30"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={DESCRIPTION_MAX}
        rows={3}
        placeholder={t.goals.fields.description}
        aria-label={t.goals.fields.description}
        className={cx(field, "px-3.5 py-3 text-base")}
      />
      <FormFooter error={error} pending={pending} valid={!!title.trim()} />
      {item && (
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={() => void archive()}>
            {item.archived ? t.goals.unarchive : t.goals.archive}
          </SecondaryButton>
          <SecondaryButton danger onClick={() => setConfirm(true)}>
            {t.goals.delete}
          </SecondaryButton>
        </div>
      )}
    </form>
  );
}

// -------------------------------------------------------------- goals ----

function GoalsSection({
  data,
  onAdd,
  onOpen,
  onReorder,
}: {
  data: GoalsData;
  onAdd: () => void;
  onOpen: (g: Goal) => void;
  onReorder: (ids: string[]) => void;
}) {
  const { active, achieved, archived } = groupGoals(data.goals);
  return (
    <section
      aria-label={t.goals.sections.goals}
      className="flex flex-col gap-6"
    >
      <AddButton label={t.goals.addGoal} onClick={onAdd} />
      {active.length === 0 && <Empty text={t.goals.empty.goals} />}
      {active.map((group) => {
        const ids = group.goals.map((g) => g.id);
        return (
          <section
            key={group.type}
            aria-label={goalTypeLabel(group.type)}
            className="flex flex-col"
          >
            <h2 className={h2}>{goalTypeLabel(group.type)}</h2>
            <ul className="flex flex-col">
              {group.goals.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center gap-2 border-b border-white/6"
                >
                  <GoalRow goal={g} visions={data.visions} onOpen={onOpen} />
                  <Reorder
                    ids={ids}
                    id={g.id}
                    title={g.title}
                    onReorder={onReorder}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {achieved.length > 0 && (
        <Collapsed summary={t.goals.achievedSection(achieved.length)}>
          {achieved.map((g) => (
            <div key={g.id} className="border-b border-white/5">
              <GoalRow goal={g} visions={data.visions} onOpen={onOpen} />
            </div>
          ))}
        </Collapsed>
      )}
      {archived.length > 0 && (
        <Collapsed summary={t.goals.archivedSection(archived.length)}>
          {archived.map((g) => (
            <div key={g.id} className="border-b border-white/5">
              <GoalRow goal={g} visions={data.visions} onOpen={onOpen} />
            </div>
          ))}
        </Collapsed>
      )}
    </section>
  );
}

function GoalRow({
  goal,
  visions,
  onOpen,
}: {
  goal: Goal;
  visions: Vision[];
  onOpen: (g: Goal) => void;
}) {
  const app = useApp();
  const { me } = useSession();
  const vision = visions.find((v) => v.id === goal.visionId);
  const meta =
    goal.status === "achieved" && goal.achievedAt
      ? t.goals.achievedOn(
          localDateISO(me.timezone, new Date(goal.achievedAt))
            .split("-")
            .reverse()
            .join("/"),
        )
      : [
          targetLabel(goal.targetDate, app.today, goal.status),
          milestonesLabel(goal.milestones),
        ]
          .filter(Boolean)
          .join(" · ");
  return (
    <button
      type="button"
      onClick={() => onOpen(goal)}
      className="flex min-h-[60px] min-w-0 flex-1 flex-col justify-center gap-1 py-2 text-left"
    >
      {vision && (
        <span className="truncate font-mono text-[10px] tracking-[.14em] text-dim">
          {vision.title.toUpperCase()}
        </span>
      )}
      <span
        className={cx(
          "text-[15px]",
          goal.status !== "active" && "text-muted",
          goal.status === "achieved" && "line-through decoration-white/25",
        )}
      >
        {goal.title}
      </span>
      {meta && (
        <span className="font-mono text-[10.5px] tracking-[.08em] text-dim tabular-nums">
          {meta}
        </span>
      )}
    </button>
  );
}

function GoalForm({
  item,
  visions,
  nextOrder,
  onChange,
  onDone,
}: {
  item?: Goal;
  visions: Vision[];
  nextOrder: number;
  onChange: (g: Goal) => void;
  onDone: (g: Goal, removed?: boolean) => void;
}) {
  const { me } = useSession();
  const [draft] = useState(() => (item ? null : loadGoalDraft(me.id, "goal")));
  const [title, setTitle] = useState(draft?.title ?? item?.title ?? "");
  const [type, setType] = useState<GoalType>(
    draft?.type ?? item?.type ?? "90_day",
  );
  const [visionId, setVisionId] = useState(
    draft?.visionId ?? item?.visionId ?? "",
  );
  const [targetDate, setTargetDate] = useState(
    draft?.targetDate ?? item?.targetDate ?? "",
  );
  const [description, setDescription] = useState(
    draft?.description ?? item?.description ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [goal, setGoal] = useState(item);

  useEffect(() => {
    if (item || done) return;
    saveGoalDraft(me.id, "goal", {
      title,
      type,
      visionId,
      targetDate,
      description,
    });
  }, [item, done, me.id, title, type, visionId, targetDate, description]);

  // Active visions, plus the linked one even if it was archived since.
  const options = visions.filter((v) => !v.archived || v.id === visionId);

  const input = () => ({
    title,
    type,
    visionId: visionId || null,
    targetDate,
    description,
  });

  async function save() {
    const invalid = validateGoal(input());
    if (invalid) return setError(invalid);
    setPending(true);
    const res = await saveGoal(item?.id ?? null, input(), nextOrder).catch(
      () => null,
    );
    setPending(false);
    if (!res?.ok)
      return setError(res && !res.ok ? res.error : t.goals.errors.saveFailed);
    if (!item) {
      setDone(true);
      clearGoalDraft(me.id, "goal");
    }
    onDone({ ...res.goal, milestones: goal?.milestones ?? [] });
  }

  async function status(next: Goal["status"]) {
    if (!goal) return;
    const res = await setGoalStatus(goal.id, next).catch(() => null);
    if (!res?.ok)
      return setError(res && !res.ok ? res.error : t.goals.errors.saveFailed);
    onDone({ ...goal, status: res.status, achievedAt: res.achievedAt });
  }

  if (confirm && goal)
    return (
      <ConfirmDelete
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          const res = await deleteGoalsItem("goal", goal.id).catch(() => null);
          if (!res?.ok)
            return setError(
              res && !res.ok ? res.error : t.goals.errors.saveFailed,
            );
          onDone(goal, true);
        }}
      />
    );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) void save();
      }}
    >
      <span className="font-mono text-[11px] tracking-[.18em] text-muted">
        {item ? t.goals.editGoal : t.goals.newGoal}
      </span>
      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setError(null);
        }}
        maxLength={TITLE_MAX}
        placeholder={t.goals.fields.goalPlaceholder}
        aria-label={t.goals.fields.title}
        className="h-14 rounded-[14px] border border-white/12 bg-bg px-4 text-[17px] outline-none focus:border-white/30"
      />
      <div className="flex flex-col gap-2">
        <span id="goal-type" className={monoLabel}>
          {t.goals.fields.type}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="goal-type"
          className="flex flex-wrap gap-1.5"
        >
          {GOAL_TYPES.map((gt) => (
            <button
              key={gt}
              type="button"
              role="radio"
              aria-checked={type === gt}
              onClick={() => setType(gt)}
              className={cx(
                "h-[38px] rounded-[10px] border px-[13px] font-mono text-[11px] tracking-[.1em]",
                chipTone(type === gt),
              )}
            >
              {goalTypeLabel(gt)}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className={monoLabel}>{t.goals.fields.vision}</span>
        <select
          value={visionId}
          onChange={(e) => setVisionId(e.target.value)}
          className={cx(field, "h-[46px] px-3 text-base [color-scheme:dark]")}
        >
          <option value="">{t.goals.fields.noVision}</option>
          {options.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={monoLabel}>{t.goals.fields.targetDate}</span>
        <input
          type="date"
          value={targetDate}
          min="2000-01-01"
          max="2100-12-31"
          onChange={(e) => setTargetDate(e.target.value)}
          className={cx(field, "h-[46px] px-3 text-base [color-scheme:dark]")}
        />
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={DESCRIPTION_MAX}
        rows={2}
        placeholder={t.goals.fields.description}
        aria-label={t.goals.fields.description}
        className={cx(field, "px-3.5 py-3 text-base")}
      />
      {goal && (
        <Milestones
          goal={goal}
          onChange={(g) => {
            setGoal(g);
            onChange(g);
          }}
          onError={setError}
        />
      )}
      <FormFooter error={error} pending={pending} valid={!!title.trim()} />
      {goal && (
        <div className="flex flex-col gap-2">
          {goal.status !== "achieved" ? (
            <button
              type="button"
              onClick={() => void status("achieved")}
              className="h-12 rounded-2xl border border-white/12 font-mono text-[11.5px] font-semibold tracking-[.2em]"
            >
              {t.goals.achieve}
            </button>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {goal.status !== "active" && (
              <SecondaryButton onClick={() => void status("active")}>
                {t.goals.reactivate}
              </SecondaryButton>
            )}
            {goal.status !== "archived" && (
              <SecondaryButton onClick={() => void status("archived")}>
                {t.goals.archive}
              </SecondaryButton>
            )}
            <SecondaryButton danger onClick={() => setConfirm(true)}>
              {t.goals.delete}
            </SecondaryButton>
          </div>
        </div>
      )}
    </form>
  );
}

/** Simple checkpoints — a count, never a percentage, never a daily list. */
function Milestones({
  goal,
  onChange,
  onError,
}: {
  goal: Goal;
  onChange: (g: Goal) => void;
  onError: (e: string) => void;
}) {
  const [title, setTitle] = useState("");
  const add = async () => {
    const res = await addMilestone(
      goal.id,
      title,
      nextSortOrder(goal.milestones),
    ).catch(() => null);
    if (!res?.ok)
      return onError(res && !res.ok ? res.error : t.goals.errors.saveFailed);
    setTitle("");
    onChange({ ...goal, milestones: [...goal.milestones, res.milestone] });
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className={monoLabel}>{t.goals.fields.milestones}</span>
      {goal.milestones.map((m) => (
        <div key={m.id} className="flex min-h-[44px] items-center gap-3">
          <button
            type="button"
            role="checkbox"
            aria-checked={m.done}
            aria-label={t.goals.toggleMilestone(m.title)}
            onClick={async () => {
              const res = await setMilestoneDone(m.id, !m.done).catch(
                () => null,
              );
              if (!res?.ok) return onError(t.goals.errors.saveFailed);
              onChange({
                ...goal,
                milestones: goal.milestones.map((x) =>
                  x.id === m.id ? { ...x, done: !m.done } : x,
                ),
              });
            }}
            className={cx(
              "flex size-6 shrink-0 items-center justify-center rounded-md border text-[12px]",
              m.done ? "border-accent bg-accent text-bg" : "border-white/20",
            )}
          >
            {m.done ? "✓" : ""}
          </button>
          <span
            className={cx(
              "flex-1 text-[14.5px]",
              m.done && "text-muted line-through",
            )}
          >
            {m.title}
          </span>
          <button
            type="button"
            aria-label={t.goals.removeMilestone(m.title)}
            onClick={async () => {
              const res = await deleteGoalsItem("milestone", m.id).catch(
                () => null,
              );
              if (!res?.ok) return onError(t.goals.errors.saveFailed);
              onChange({
                ...goal,
                milestones: goal.milestones.filter((x) => x.id !== m.id),
              });
            }}
            className="size-9 text-dim hover:text-text"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (title.trim()) void add();
            }
          }}
          maxLength={TITLE_MAX}
          placeholder={t.goals.fields.milestonePlaceholder}
          aria-label={t.goals.fields.milestonePlaceholder}
          className={cx(field, "h-11 min-w-0 flex-1 px-3 text-[15px]")}
        />
        <button
          type="button"
          disabled={!title.trim()}
          onClick={() => void add()}
          aria-label={t.goals.fields.addMilestone}
          className="h-11 rounded-xl border border-white/12 px-4 text-sm disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- mirror ----

function MirrorSection({
  items,
  onAdd,
  onOpen,
  onReorder,
}: {
  items: MirrorItem[];
  onAdd: () => void;
  onOpen: (m: MirrorItem) => void;
  onReorder: (ids: string[]) => void;
}) {
  const active = activeMirror(items);
  const inactive = inactiveMirror(items);
  const ids = active.map((m) => m.id);
  return (
    <section
      aria-label={t.goals.sections.mirror}
      className="flex flex-col gap-5"
    >
      <p className="text-[14.5px] text-muted">{t.goals.mirrorSub}</p>
      <AddButton label={t.goals.addMirror} onClick={onAdd} />
      {active.length === 0 && <Empty text={t.goals.empty.mirror} />}
      <ul className="flex flex-col gap-4">
        {active.map((m) => (
          <li
            key={m.id}
            className="flex items-start gap-2 border-l-2 border-white/25 pl-4"
          >
            <button
              type="button"
              onClick={() => onOpen(m)}
              className="min-w-0 flex-1 text-left text-[19px] leading-[1.4] font-medium tracking-[-0.01em] text-pretty"
            >
              {m.text}
            </button>
            <Reorder ids={ids} id={m.id} title={m.text} onReorder={onReorder} />
          </li>
        ))}
      </ul>
      {inactive.length > 0 && (
        <Collapsed summary={t.goals.inactiveSection(inactive.length)}>
          {inactive.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpen(m)}
              className="min-h-[46px] border-b border-white/5 text-left text-sm text-muted"
            >
              {m.text}
            </button>
          ))}
        </Collapsed>
      )}
    </section>
  );
}

function MirrorForm({
  item,
  nextOrder,
  onDone,
}: {
  item?: MirrorItem;
  nextOrder: number;
  onDone: (m: MirrorItem, removed?: boolean) => void;
}) {
  const { me } = useSession();
  const [draft] = useState(() =>
    item ? null : loadGoalDraft(me.id, "mirror"),
  );
  const [text, setText] = useState(draft?.text ?? item?.text ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (item || done) return;
    saveGoalDraft(me.id, "mirror", { text });
  }, [item, done, me.id, text]);

  async function save() {
    const invalid = validateMirror(text);
    if (invalid) return setError(invalid);
    setPending(true);
    const res = await saveMirror(item?.id ?? null, text, nextOrder).catch(
      () => null,
    );
    setPending(false);
    if (!res?.ok)
      return setError(res && !res.ok ? res.error : t.goals.errors.saveFailed);
    if (!item) {
      setDone(true);
      clearGoalDraft(me.id, "mirror");
    }
    onDone(res.item);
  }

  if (confirm && item)
    return (
      <ConfirmDelete
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          const res = await deleteGoalsItem("mirror", item.id).catch(
            () => null,
          );
          if (!res?.ok)
            return setError(
              res && !res.ok ? res.error : t.goals.errors.saveFailed,
            );
          onDone(item, true);
        }}
      />
    );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) void save();
      }}
    >
      <label className="flex flex-col gap-2">
        <span className="font-mono text-[11px] tracking-[.18em] text-muted">
          {t.goals.fields.mirror}
        </span>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          maxLength={MIRROR_MAX}
          rows={3}
          placeholder={t.goals.fields.mirrorPlaceholder}
          className={cx(field, "px-3.5 py-3 text-[17px]")}
        />
      </label>
      <FormFooter error={error} pending={pending} valid={!!text.trim()} />
      {item && (
        <div className="flex flex-wrap gap-2">
          <SecondaryButton
            onClick={async () => {
              const res = await setMirrorActive(item.id, !item.active).catch(
                () => null,
              );
              if (!res?.ok)
                return setError(
                  res && !res.ok ? res.error : t.goals.errors.saveFailed,
                );
              onDone(res.item);
            }}
          >
            {item.active ? t.goals.deactivate : t.goals.activate}
          </SecondaryButton>
          <SecondaryButton danger onClick={() => setConfirm(true)}>
            {t.goals.delete}
          </SecondaryButton>
        </div>
      )}
    </form>
  );
}

// ------------------------------------------------------------- shared ----

function FormFooter({
  error,
  pending,
  valid,
}: {
  error: string | null;
  pending: boolean;
  valid: boolean;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="-mt-1 text-[13px] text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        aria-disabled={!valid || pending}
        className={cx(
          "h-14 rounded-2xl font-mono text-[12.5px] font-semibold tracking-[.28em] transition-all duration-200 active:scale-[.97]",
          valid && !pending ? "bg-accent text-bg" : "bg-selected text-ghost",
        )}
      >
        {t.goals.save}
      </button>
    </>
  );
}

function SecondaryButton({
  children,
  onClick,
  danger = false,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "h-11 rounded-xl border border-white/10 px-4 text-sm",
        danger ? "text-danger" : "text-muted",
      )}
    >
      {children}
    </button>
  );
}

function ConfirmDelete({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <div className="flex flex-col gap-2 animate-[li-fade-up_.2s_ease]">
      <span className="pb-2 text-base">{t.goals.confirmDelete}</span>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await onConfirm();
          setPending(false);
        }}
        className="h-14 rounded-[14px] bg-danger font-mono text-[12.5px] font-semibold tracking-[.2em] text-bg disabled:opacity-60"
      >
        {t.goals.confirmDeleteYes}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="h-12 text-sm text-dim"
      >
        {t.goals.cancel}
      </button>
    </div>
  );
}
