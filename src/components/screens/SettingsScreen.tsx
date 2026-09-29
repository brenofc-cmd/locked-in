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
import { updateSetting, updateTimezone } from "@/app/(app)/settings-actions";
import { useApp } from "@/components/app-state";
import { useSession } from "@/components/session";
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

const heading = "font-mono text-[11px] font-normal tracking-[.16em] text-muted";

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
      <h1 className="m-0 text-[25px] font-semibold tracking-[-0.025em] max-[384px]:text-[23px] desk:text-[38px]">
        {t.settings.title}
      </h1>

      <Profile />

      <section aria-labelledby="standard-h" className="flex flex-col gap-3">
        <h2 id="standard-h" className={heading}>
          {t.settings.dailyStandard}
        </h2>
        <span className="text-[13.5px] leading-[1.5] text-dim">
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
                  "h-[46px] rounded-xl border text-[15px] font-medium",
                  on
                    ? "border-text bg-text text-bg"
                    : "border-white/9 text-muted",
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
          className={cx(heading, "border-b border-white/9 pb-2")}
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
          className={cx(heading, "border-b border-white/9 pb-2")}
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
          <div className="flex items-center gap-3 border-b border-white/5 py-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-dim">{t.settings.from}</span>
              <input
                type="time"
                aria-label={t.settings.quietStart}
                value={s.quietHoursStart}
                onChange={(e) =>
                  e.target.value && void save("quietHoursStart", e.target.value)
                }
                className="h-11 rounded-xl border border-white/10 bg-field px-3 text-text outline-none"
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
                className="h-11 rounded-xl border border-white/10 bg-field px-3 text-text outline-none"
              />
            </label>
          </div>
        )}
        <BrowserNotifications />
        <span className="pt-3 text-[12.5px] leading-[1.5] text-dim">
          {t.settings.notifyNote}
        </span>
      </section>

      <section aria-labelledby="privacy-h" className="flex flex-col gap-1.5">
        <h2 id="privacy-h" className={heading}>
          {t.settings.privacy}
        </h2>
        <span className="text-[13.5px] leading-[1.5] text-dim">
          {t.settings.privacyText}
        </span>
      </section>

      <section aria-labelledby="duo-h" className="flex flex-col">
        <h2 id="duo-h" className={cx(heading, "border-b border-white/9 pb-2")}>
          {t.settings.duo}
        </h2>
        <Link
          href="/duo"
          className="flex min-h-[56px] items-center justify-between gap-3 border-b border-white/5 text-[14.5px]"
        >
          <span>
            {duo?.partner
              ? t.settings.duoWith(duo.partner.displayName)
              : duo
                ? t.settings.waitingPartner
                : t.settings.noPartner}
          </span>
          <span aria-hidden="true" className="text-faint">
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
          onSubmit={() => clearResume(me.id)}
        >
          <button
            type="submit"
            className="h-11 rounded-xl border border-white/12 px-[18px] text-sm"
          >
            {t.settings.signOut}
          </button>
        </form>
        <span className="text-[12.5px] text-dim">
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
      className="flex min-h-[62px] items-center justify-between gap-4 border-b border-white/5 py-2 text-left"
    >
      <span className="flex flex-col gap-1">
        <span className="text-[14.5px]">{label}</span>
        <span className="text-[12.5px] text-dim">{d}</span>
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
    <section aria-labelledby="profile-h" className="flex flex-col gap-4">
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
        <label htmlFor="display-name" className="text-[13px] text-dim">
          {t.settings.displayName}
        </label>
        <div className="flex gap-2">
          <input
            id="display-name"
            value={name}
            maxLength={40}
            autoComplete="given-name"
            onChange={(e) => setName(e.target.value)}
            className="h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-field px-3.5 text-base outline-none focus:border-white/30"
          />
          <button
            type="submit"
            disabled={!dirtyName || pending}
            className="h-12 rounded-xl border border-white/12 px-4 text-sm disabled:opacity-50"
          >
            {pending ? t.settings.saving : t.settings.save}
          </button>
        </div>
      </form>
      <div className="flex flex-col gap-2">
        <label htmlFor="timezone" className="text-[13px] text-dim">
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
          className="h-12 min-w-0 rounded-xl border border-white/10 bg-field px-3 text-[15px] text-text outline-none"
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replaceAll("_", " ")}
            </option>
          ))}
        </select>
        <span className="text-[12.5px] leading-[1.5] text-dim">
          {t.settings.timezoneNote}
        </span>
      </div>
    </section>
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
    <div className="flex min-h-[62px] items-center justify-between gap-4 border-b border-white/5 py-2">
      <span className="flex flex-col gap-1">
        <span className="text-[14.5px]">{t.settings.browserNotifications}</span>
        <span
          className="text-[12.5px] text-dim"
          data-testid="browser-permission"
        >
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
          className="h-11 shrink-0 rounded-xl border border-white/12 px-4 text-sm"
        >
          {t.settings.allow}
        </button>
      )}
    </div>
  );
}

type InstallEvent = Event & { prompt: () => Promise<void> };

/** Offered only when the browser says the app can be installed. */
function InstallApp() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);
  if (!evt) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        await evt.prompt();
        setEvt(null);
      }}
      className="flex min-h-[56px] items-center justify-between gap-3 border-y border-white/7 text-left text-[14.5px]"
    >
      <span className="flex flex-col gap-1">
        <span>{t.settings.install}</span>
        <span className="text-[12.5px] text-dim">{t.settings.installD}</span>
      </span>
      <span aria-hidden="true" className="text-faint">
        ›
      </span>
    </button>
  );
}
