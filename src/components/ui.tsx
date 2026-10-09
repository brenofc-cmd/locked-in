/**
 * Small visual primitives reused across screens. Styles are copied from the
 * approved design (design-reference/export/Locked In v3.dc.html).
 */
import type { CSSProperties, ReactNode } from "react";
import { ProgressPulse } from "@/components/progress-pulse";
import { ProofTrack } from "@/components/proof-track";
import type { Pill } from "@/lib/today";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** The LOCKED IN mark (V3): a rounded square holding one Proof Pill. */
export function LogoMark({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  const outer = {
    sm: "size-[18px] border-2 rounded-md",
    md: "size-[22px] border-[2.5px] rounded-[7px]",
    lg: "size-7 border-[2.5px] rounded-[9px]",
  }[size];
  const inner = {
    sm: "h-[9px] w-1 rounded-xs",
    md: "h-[11px] w-[5px] rounded-[3px]",
    lg: "h-[13px] w-1.5 rounded-[3px]",
  }[size];
  return (
    <span
      aria-hidden="true"
      className={cx("flex items-center justify-center border-accent", outer)}
    >
      <span className={cx("bg-accent", inner)} />
    </span>
  );
}

export function StatusDot({
  live,
  pulse = "",
  size = 7,
  className,
}: {
  live: boolean;
  pulse?: string;
  size?: 6 | 7;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "shrink-0 rounded-full",
        size === 6 ? "size-1.5" : "size-[7px]",
        live ? "bg-accent" : "bg-faint",
        live && pulse,
        className,
      )}
    />
  );
}

export function Avatar({
  initial,
  me = false,
  className,
  style,
}: {
  initial: string;
  me?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full font-semibold",
        me ? "bg-text text-bg" : "bg-avatar text-text",
        className,
      )}
    >
      {initial}
    </span>
  );
}

/** Above this many pills one is too thin to read: one continuous bar. */
const MAX_PILLS = 24;

export function ProgressBar({
  pct,
  label,
  tone = "accent",
  marker,
  pills,
  className,
}: {
  pct: number;
  label: string;
  tone?: "accent" | "text" | "partner";
  marker?: number;
  /**
   * Today's bar (V3 "Pílulas de Prova"): the day as pieces of proof, one
   * pill per task, in list order — not an abstract percentage.
   */
  pills?: readonly Pill[];
  className?: string;
}) {
  const fill = cx(
    tone === "accent" && "bg-accent",
    tone === "text" && "bg-text",
    tone === "partner" && "bg-partner",
  );
  const pilled = pills && pills.length > 1 && pills.length <= MAX_PILLS;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cx(
        "relative",
        pilled ? "flex items-center" : "h-1.5 rounded-sm bg-line",
        className,
      )}
    >
      {pilled ? (
        // V3.3 Proof Track: the pills as one segmented track, in fill order.
        <ProofTrack pills={pills} standard={marker} />
      ) : (
        <div
          className={cx(
            "h-full rounded-sm transition-[width] duration-700 ease-[var(--ease-out-quick)]",
            fill,
          )}
          style={{ width: `${pct}%` }}
        />
      )}
      {tone === "accent" && !pilled && <ProgressPulse pct={pct} />}
      {marker !== undefined && !pilled && (
        <span
          aria-hidden="true"
          className="absolute -top-[3px] h-3 w-[1.5px] bg-marker"
          style={{ left: `${marker}%` }}
        />
      )}
    </div>
  );
}

/** Mono uppercase label + right-hand value, over a hairline. */
export function SectionHeader({
  label,
  right,
  tracking = "tracking-eyebrow",
  as: As = "div",
}: {
  label: ReactNode;
  right?: ReactNode;
  tracking?: string;
  as?: "div" | "h2";
}) {
  return (
    <As className="flex items-baseline justify-between border-b border-line-strong pb-2 font-normal">
      <span className={cx("font-mono text-meta text-muted", tracking)}>
        {label}
      </span>
      {right !== undefined && (
        <span className="font-mono text-meta text-dim tabular-nums">
          {right}
        </span>
      )}
    </As>
  );
}

/** Pill switch (V3: 46×28 in settings, 36×22 compact). */
export function SwitchTrack({
  on,
  compact = false,
}: {
  on: boolean;
  compact?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "relative shrink-0 transition-colors duration-200",
        compact ? "h-[22px] w-9 rounded-xl" : "h-7 w-[46px] rounded-[14px]",
        on ? "bg-accent" : "bg-off",
      )}
    >
      <span
        className={cx(
          "absolute top-[3px] rounded-full transition-[left] duration-200",
          compact ? "size-4" : "size-[22px]",
          on ? "bg-bg" : "bg-muted",
        )}
        style={{ left: on ? (compact ? 17 : 21) : 3 }}
      />
    </span>
  );
}

/** Selected / unselected look used by chips, durations and options. */
export function chipTone(on: boolean) {
  return on
    ? "border-accent-line bg-accent-wash text-text"
    : "border-line-strong bg-transparent text-muted";
}

export function CheckPath({
  drawn,
  strokeWidth = 2.2,
  color = "var(--color-bg)",
}: {
  drawn: boolean;
  strokeWidth?: number;
  color?: string;
}) {
  return (
    <path
      d="M3.5 8.5l3 3 6-7"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        strokeDasharray: 16,
        strokeDashoffset: drawn ? 0 : 16,
        transition:
          "stroke-dashoffset .28s var(--ease-out-quick) .1s, stroke .3s ease",
      }}
    />
  );
}

/** Small filled check box used in read-only lists. */
export function MiniCheck({
  done,
  size = 20,
  radius = 6,
  light = false,
}: {
  done: boolean;
  size?: number;
  radius?: number;
  light?: boolean;
}) {
  const fill = light ? "var(--color-text)" : "var(--color-accent-strong)";
  const edge = light ? "var(--color-text)" : "var(--color-accent-done)";
  const mark = light ? "var(--color-bg)" : "var(--color-accent)";
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center transition-all duration-300"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        border: `1.5px solid ${done ? edge : "var(--color-line-check)"}`,
        background: done ? fill : "transparent",
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 16 16">
        <path
          d="M3.5 8.5l3 3 6-7"
          fill="none"
          stroke={mark}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: done ? 1 : 0 }}
        />
      </svg>
    </span>
  );
}

export const Chevron = () => (
  <span aria-hidden="true" className="text-ghost">
    ›
  </span>
);
