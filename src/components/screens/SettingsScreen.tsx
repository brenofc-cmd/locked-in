"use client";

import { LOCALE, t } from "@/i18n/pt-BR";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";

const noSubscribe = () => () => {};
import {
  changePassword,
  sendPasswordLink,
  updateSetting,
  updateTimezone,
} from "@/app/(app)/settings-actions";
import { useApp } from "@/components/app-state";
import { Rook } from "@/components/brand/Rook";
import { useSession } from "@/components/session";
import { useInstallPrompt } from "@/components/use-install-prompt";
import {
  detectSupport,
  disablePush,
  enablePush,
  permissionNow,
  prepareSignOut,
  syncPushDevice,
} from "@/components/push/push-device";
import { requestTestPush } from "@/app/(app)/push-actions";
import { pushState, type PushState } from "@/lib/push";
import { clearResume } from "@/lib/resume-state";
import { SwitchTrack, cx } from "@/components/ui";
import { STANDARD_OPTIONS } from "@/lib/constants";
import type { SettingKey, UserSettings } from "@/lib/settings";

const since = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const heading = "font-mono text-meta font-normal tracking-eyebrow text-muted";

type BoolKey = {
  [K in SettingKey]: UserSettings[K] extends boolean ? K : never;
}[SettingKey];

const NOTIFY: { k: BoolKey; label: string; d: string }[] = [
  {
    k: "notifyPartnerActivity",
    label: t.settings.notifyPartner,
    d: t.settings.notifyPartnerD,
  },
  {
    k: "notifyReactions",
    label: t.settings.notifyReactions,
    d: t.settings.notifyReactionsD,
  },
  {
    k: "notifyTaskReminders",
    label: t.settings.notifyReminders,
    d: t.settings.notifyRemindersD,
  },
  {
    k: "notifyWeeklyReview",
    label: t.settings.notifyWeekly,
    d: t.settings.notifyWeeklyD,
  },
];

/** Settings (Stage 8): every control is persisted. */
export function SettingsScreen() {
  const app = useApp();
  const { me, duo, settings } = useSession();
  const [local, setLocal] = useState<Partial<UserSettings>>({});
  const s = { ...settings, ...local };

  async function save<K extends SettingKey>(key: K, value: UserSettings[K]) {
    const before = s[key];
    setLocal((l) => ({ ...l, [key]: value }));
    const res = await updateSetting(key, value).catch(() => null);
    if (!res?.ok) {
      setLocal((l) => ({ ...l, [key]: before }));
      app.toast({
        text: res && !res.ok ? res.error : t.errors.network,
        sub: t.settings.toastSub,
      });
    }
  }

  return (
    <div className="flex max-w-[620px] flex-col gap-9 animate-[li-fade-up_.4s_ease]">
      <h1 className="page-title">{t.settings.title}</h1>

      <Profile />
      <PasswordSection />

      <section aria-labelledby="standard-h" className="flex flex-col gap-3">
        <h2 id="standard-h" className={heading}>
          {t.settings.dailyStandard}
        </h2>
        <span className="text-small leading-[1.5] text-dim">
          {t.settings.standardHelp}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="standard-h"
          className="grid grid-cols-4 gap-1.5"
        >
          {STANDARD_OPTIONS.map((o) => {
            const on = app.standard === o;
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => app.setStandard(o)}
                className={cx(
                  "h-[46px] rounded-xl border text-body font-medium",
                  on
                    ? "border-text bg-text text-bg"
                    : "border-line-strong text-muted",
                )}
              >
                {o}%
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="daily-h" className="flex flex-col">
        <h2
          id="daily-h"
          className={cx(heading, "border-b border-line-strong pb-2")}
        >
          {t.settings.daily}
        </h2>
        <Toggle
          label={t.settings.briefing}
          d={t.settings.briefingD}
          on={s.showMorningBriefing}
          onChange={(v) => void save("showMorningBriefing", v)}
        />
        <Toggle
          label={t.settings.shareNew(duo?.partner?.displayName)}
          d={t.settings.shareNewD}
          on={s.shareNewTasks}
          onChange={(v) => void save("shareNewTasks", v)}
        />
      </section>

      <section aria-labelledby="notif-h" className="flex flex-col">
        <h2
          id="notif-h"
          className={cx(heading, "border-b border-line-strong pb-2")}
        >
          {t.settings.notifications}
        </h2>
        {NOTIFY.map((n) => (
          <Toggle
            key={n.k}
            label={n.label}
            d={n.d}
            on={s[n.k]}
            onChange={(v) => void save(n.k, v)}
          />
        ))}
        <Toggle
          label={t.settings.quietHours}
          d={t.settings.quietHoursD}
          on={s.quietHoursEnabled}
          onChange={(v) => void save("quietHoursEnabled", v)}
        />
        {s.quietHoursEnabled && (
          <div className="flex items-center gap-3 border-b border-line py-3 text-body">
            <label className="flex items-center gap-2">
              <span className="text-dim">{t.settings.from}</span>
              <input
                type="time"
                aria-label={t.settings.quietStart}
                value={s.quietHoursStart}
                onChange={(e) =>
                  e.target.value && void save("quietHoursStart", e.target.value)
                }
                className="h-11 rounded-xl border border-line-strong bg-field px-3 text-text outline-none"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-dim">{t.settings.to}</span>
              <input
                type="time"
                aria-label={t.settings.quietEnd}
                value={s.quietHoursEnd}
                onChange={(e) =>
                  e.target.value && void save("quietHoursEnd", e.target.value)
                }
                className="h-11 rounded-xl border border-line-strong bg-field px-3 text-text outline-none"
              />
            </label>
          </div>
        )}
        <PushSettings settings={s} save={save} />
        <span className="pt-3 text-small leading-[1.5] text-dim">
          {t.settings.notifyNote}
        </span>
      </section>

      <section aria-labelledby="privacy-h" className="flex flex-col gap-1.5">
        <h2 id="privacy-h" className={heading}>
          {t.settings.privacy}
        </h2>
        <span className="text-small leading-[1.5] text-dim">
          {t.settings.privacyText}
        </span>
      </section>

      <section aria-labelledby="duo-h" className="flex flex-col">
        <h2
          id="duo-h"
          className={cx(heading, "border-b border-line-strong pb-2")}
        >
          {t.settings.duo}
        </h2>
        <Link
          href="/duo"
          className="flex min-h-[56px] items-center justify-between gap-3 border-b border-line text-body"
        >
          <span>
            {duo?.partner
              ? t.settings.duoWith(duo.partner.displayName)
              : duo
                ? t.settings.waitingPartner
                : t.settings.noPartner}
          </span>
          <span aria-hidden="true" className="text-ghost">
            ›
          </span>
        </Link>
      </section>

      <InstallApp />

      <div className="flex flex-wrap items-center gap-3">
        {/* V2: an explicit sign-out forgets this user's Resume State on
            this device (route, scroll, drafts), so the next person to use
            it never lands on the previous user's screen. */}
        <form
          action="/auth/signout"
          method="post"
          onSubmit={(e) => {
            clearResume(me.id);
            // V2 Phase 10: this device stops receiving my pushes.
            prepareSignOut(e.currentTarget);
          }}
        >
          <input type="hidden" name="push_endpoint" defaultValue="" />
          <button
            type="submit"
            className="h-12 rounded-[14px] border border-line-bold px-[18px] text-body font-semibold"
          >
            {t.settings.signOut}
          </button>
        </form>
        <span className="text-small text-dim">
          {t.settings.since(me.email, since(me.createdAt))}
        </span>
      </div>
    </div>
  );
}

function Toggle({
  label,
  d,
  on,
  onChange,
}: {
  label: string;
  d: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-[62px] items-center justify-between gap-4 border-b border-line py-2 text-left"
    >
      <span className="flex flex-col gap-1">
        <span className="text-body">{label}</span>
        <span className="text-small text-dim">{d}</span>
      </span>
      <SwitchTrack on={on} />
    </button>
  );
}

function Profile() {
  const app = useApp();
  const { me } = useSession();
  const [name, setName] = useState(app.userName);
  const [tz, setTz] = useState(me.timezone);
  const [pending, start] = useTransition();
  const zones = useMemo(() => {
    try {
      const all = Intl.supportedValuesOf("timeZone");
      return all.includes(me.timezone) ? all : [me.timezone, ...all];
    } catch {
      return [me.timezone];
    }
  }, [me.timezone]);

  const dirtyName = name.trim() !== app.userName && name.trim().length > 0;

  return (
    <section
      id="conta"
      aria-labelledby="profile-h"
      className="flex scroll-mt-6 flex-col gap-4"
    >
      <h2 id="profile-h" className={heading}>
        {t.settings.profile}
      </h2>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dirtyName) return;
          start(async () => {
            await app.setUserName(name.trim());
          });
        }}
      >
        <label htmlFor="display-name" className="text-small text-dim">
          {t.settings.displayName}
        </label>
        <div className="flex gap-2">
          <input
            id="display-name"
            value={name}
            maxLength={40}
            autoComplete="given-name"
            onChange={(e) => setName(e.target.value)}
            className="h-[54px] min-w-0 flex-1 rounded-xl border-[1.5px] border-line-strong bg-field px-3.5 text-base outline-none focus:border-line-bold"
          />
          <button
            type="submit"
            disabled={!dirtyName || pending}
            className="h-12 rounded-[14px] border border-line-bold px-[18px] text-body font-semibold disabled:opacity-50"
          >
            {pending ? t.settings.saving : t.settings.save}
          </button>
        </div>
      </form>
      <div className="flex flex-col gap-2">
        <label htmlFor="timezone" className="text-small text-dim">
          {t.settings.timezone}
        </label>
        <select
          id="timezone"
          value={tz}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            const before = tz;
            setTz(next);
            start(async () => {
              const res = await updateTimezone(next).catch(() => null);
              if (!res?.ok) {
                setTz(before);
                app.toast({
                  text: res && !res.ok ? res.error : t.errors.network,
                  sub: t.settings.timezoneSub,
                });
              } else {
                // "Today" may now be another date: start it from the database.
                window.location.reload();
              }
            });
          }}
          className="h-[54px] min-w-0 rounded-xl border-[1.5px] border-line-strong bg-field px-3 text-body text-text outline-none"
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <span className="text-small leading-[1.5] text-dim">
          {t.settings.timezoneNote}
        </span>
      </div>
    </section>
  );
}

/**
 * Change the password while signed in: new + confirm, or a link to the
 * account's e-mail (the same flow as "Esqueci a senha").
 */
function PasswordSection() {
  const app = useApp();
  const { me } = useSession();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [sending, startLink] = useTransition();
  const field =
    "h-[54px] min-w-0 rounded-xl border-[1.5px] border-line-strong bg-field px-3.5 text-base outline-none focus:border-line-bold";

  return (
    <section aria-labelledby="password-h" className="flex flex-col gap-3">
      <h2 id="password-h" className={heading}>
        {t.account.password}
      </h2>
      <p className="m-0 text-small leading-[1.5] text-dim">
        {t.account.passwordHelp}
      </p>
      <form
        className="flex flex-col gap-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const res = await changePassword(password, confirm).catch(
              () => null,
            );
            if (!res?.ok) {
              setError(res && !res.ok ? res.error : t.errors.network);
              return;
            }
            setPassword("");
            setConfirm("");
            app.toast({ text: t.account.passwordSaved, sub: t.account.sub });
          });
        }}
      >
        <label className="flex flex-col gap-2">
          <span className="text-small text-dim">{t.account.newPassword}</span>
          <input
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "password-error" : undefined}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-small text-dim">
            {t.account.confirmPassword}
          </span>
          <input
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "password-error" : undefined}
            className={field}
          />
        </label>
        {error && (
          <span
            id="password-error"
            role="alert"
            className="text-small text-danger"
          >
            {error}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending || !password || !confirm}
            className="h-12 rounded-[14px] border border-line-bold px-[18px] text-body font-semibold disabled:opacity-50"
          >
            {pending ? t.settings.saving : t.account.savePassword}
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              startLink(async () => {
                const res = await sendPasswordLink().catch(() => null);
                app.toast({
                  text: res?.ok
                    ? t.account.linkSent(me.email)
                    : res && !res.ok
                      ? res.error
                      : t.errors.network,
                  sub: t.account.sub,
                });
              })
            }
            className="h-11 text-small text-muted underline underline-offset-[3px] hover:text-text disabled:opacity-50"
          >
            {sending ? t.account.sending : t.account.orLink}
          </button>
        </div>
      </form>
    </section>
  );
}

const PUSH_KINDS: { k: BoolKey; label: string; d: string }[] = [
  { k: "pushPlanner", label: t.push.planner, d: t.push.plannerD },
  { k: "pushNudges", label: t.push.nudges, d: t.push.nudgesD },
  { k: "pushReviews", label: t.push.reviews, d: t.push.reviewsD },
  { k: "pushWeeklyPlan", label: t.push.weeklyPlan, d: t.push.weeklyPlanD },
  { k: "pushHideDetails", label: t.push.hideDetails, d: t.push.hideDetailsD },
];

const PUSH_TEXT: Record<PushState, string> = {
  on: t.push.state.on,
  off: t.push.state.off,
  denied: t.push.state.denied,
  unsupported: t.push.state.unsupported,
  "ios-install": t.push.state.iosInstall,
  unconfigured: t.push.state.unconfigured,
};

/**
 * Web Push on this device (V2 Phase 10, docs/WEB_PUSH.md). The browser
 * prompt appears only after "Ativar neste dispositivo"; the state is always
 * written out (never only a colour).
 */
function PushSettings({
  settings,
  save,
}: {
  settings: UserSettings;
  save: <K extends SettingKey>(key: K, value: UserSettings[K]) => Promise<void>;
}) {
  const app = useApp();
  const support = useSyncExternalStore(
    noSubscribe,
    detectSupport,
    () => "unsupported" as const,
  );
  const initialPerm = useSyncExternalStore(
    noSubscribe,
    permissionNow,
    () => "default" as const,
  );
  const [perm, setPerm] = useState<NotificationPermission | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState<"enable" | "disable" | "test" | null>(null);

  useEffect(() => {
    let alive = true;
    void syncPushDevice().then((on) => {
      if (alive) setSubscribed(on);
    });
    return () => {
      alive = false;
    };
  }, []);

  const state = pushState(support, perm ?? initialPerm, subscribed);

  async function enable() {
    setBusy("enable");
    const res = await enablePush();
    setPerm(permissionNow());
    setSubscribed(res.ok);
    setBusy(null);
    if (!res.ok)
      app.toast({
        text: res.denied ? t.push.errors.denied : t.push.errors.failed,
        sub: t.push.sub,
      });
  }

  async function disable() {
    setBusy("disable");
    const ok = await disablePush();
    if (ok) setSubscribed(false);
    setBusy(null);
    if (!ok) app.toast({ text: t.push.errors.disableFailed, sub: t.push.sub });
  }

  async function test() {
    setBusy("test");
    const res = await requestTestPush().catch(() => null);
    setBusy(null);
    app.toast({
      text: res?.ok ? t.push.testSent : (res?.error ?? t.errors.network),
      sub: t.push.sub,
    });
  }

  const fallback = state === "unsupported" || state === "unconfigured";

  return (
    <div className="flex flex-col" data-testid="push-settings">
      <div className="flex min-h-[62px] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line py-3">
        {/* Setting push up is a moment worth a nod from Rook (off only). */}
        {state === "off" && <Rook pose="ready" size={44} />}
        <span className="flex min-w-0 flex-1 basis-[220px] flex-col gap-1">
          <span className="text-body">{t.push.title}</span>
          <span
            role="status"
            data-testid="push-state"
            data-state={state}
            className="text-small leading-[1.5] text-dim"
          >
            {PUSH_TEXT[state]}
          </span>
        </span>
        {state === "off" && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void enable()}
            className="h-12 shrink-0 rounded-[14px] border border-line-bold px-[18px] text-body font-semibold disabled:opacity-50"
          >
            {busy === "enable" ? t.push.enabling : t.push.enable}
          </button>
        )}
        {state === "on" && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void disable()}
            className="h-12 shrink-0 rounded-[14px] border border-line-bold px-[18px] text-body font-semibold disabled:opacity-50"
          >
            {busy === "disable" ? t.push.disabling : t.push.disable}
          </button>
        )}
      </div>
      {state === "on" && (
        <>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void test()}
            className="flex min-h-[52px] items-center border-b border-line text-left text-body disabled:opacity-50"
          >
            {t.push.test}
          </button>
          <span className="pt-4 pb-1 text-small text-dim">
            {t.push.kindsHeading}
          </span>
          {PUSH_KINDS.map((n) => (
            <Toggle
              key={n.k}
              label={n.label}
              d={n.d}
              on={settings[n.k]}
              onChange={(v) => void save(n.k, v)}
            />
          ))}
        </>
      )}
      {fallback && <BrowserNotifications />}
    </div>
  );
}

/** Browser notifications: asked only from this button, never on load. */
function BrowserNotifications() {
  const current = useSyncExternalStore(
    noSubscribe,
    () =>
      typeof Notification === "undefined"
        ? "unsupported"
        : Notification.permission,
    () => "default" as const,
  );
  const [asked, setPerm] = useState<NotificationPermission | null>(null);
  const perm = asked ?? current;

  if (perm === "unsupported") return null;
  return (
    <div className="flex min-h-[62px] items-center justify-between gap-4 border-b border-line py-2">
      <span className="flex flex-col gap-1">
        <span className="text-body">{t.settings.browserNotifications}</span>
        <span className="text-small text-dim" data-testid="browser-permission">
          {perm === "granted"
            ? t.settings.permGranted
            : perm === "denied"
              ? t.settings.permDenied
              : t.settings.permDefault}
        </span>
      </span>
      {perm === "default" && (
        <button
          type="button"
          onClick={async () => {
            const res = await Notification.requestPermission();
            setPerm(res);
          }}
          className="h-12 shrink-0 rounded-[14px] border border-line-bold px-[18px] text-body font-semibold"
        >
          {t.settings.allow}
        </button>
      )}
    </div>
  );
}

/** Offered only when the browser says the app can be installed. */
function InstallApp() {
  const install = useInstallPrompt();
  if (!install) return null;
  return (
    <button
      type="button"
      onClick={() => void install()}
      className="flex min-h-[56px] items-center justify-between gap-3 border-y border-line text-left text-body"
    >
      <span className="flex flex-col gap-1">
        <span>{t.settings.install}</span>
        <span className="text-small text-dim">{t.settings.installD}</span>
      </span>
      <span aria-hidden="true" className="text-ghost">
        ›
      </span>
    </button>
  );
}
