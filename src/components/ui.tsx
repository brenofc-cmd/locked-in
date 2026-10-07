/**
 * Small visual primitives reused across screens. Styles are copied from the
 * approved design (design-reference/export/Locked In v3.dc.html).
 */
import type { CSSProperties, ReactNode } from "react";
import { ProgressPulse } from "@/components/progress-pulse";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/** The square-in-square LOCKED IN mark. */
export function LogoMark({ size = "sm" }: { size?: "sm" | "md" | "lg" }) {
  const outer = {
    sm: "size-[14px] border-2 rounded-sm",
    md: "size-[15px] border-2 rounded-sm",
    lg: "size-7 border-[2.5px] rounded-lg",
  }[size];
  const inner = {
    sm: "size-1 rounded-xs",
    md: "size-[5px] rounded-xs",
    lg: "size-2 rounded-xs",
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

export function ProgressBar({
  pct,
  label,
  tone = "accent",
  marker,
  className,
}: {
  pct: number;
  label: string;
  tone?: "accent" | "text" | "partner";
  marker?: number;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cx("relative h-1 rounded-sm bg-white/6", className)}
    >
      <div
        className={cx(
          "h-full rounded-sm transition-[width] duration-700 ease-[var(--ease-out-quick)]",
          tone === "accent" && "bg-accent",
          tone === "text" && "bg-text",
          tone === "partner" && "bg-ghost",
        )}
        style={{ width: `${pct}%` }}
      />
      {tone === "accent" && <ProgressPulse pct={pct} />}
      {marker !== undefined && (
        <span
          aria-hidden="true"
          className="absolute -top-[3px] h-2.5 w-[1.5px] bg-[rgba(236,235,230,0.35)]"
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

/** Pill switch (44×26 in settings, 36×22 compact). */
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
        compact ? "h-[22px] w-9 rounded-xl" : "h-[26px] w-11 rounded-xl",
        on ? "bg-accent" : "bg-off",
      )}
    >
      <span
        className={cx(
          "absolute top-[3px] rounded-full transition-[left] duration-200",
          compact ? "size-4" : "size-5",
          on ? "bg-bg" : "bg-dim",
        )}
        style={{ left: on ? (compact ? 17 : 21) : 3 }}
      />
    </span>
  );
}

/** Selected / unselected look used by chips, durations and options. */
export function chipTone(on: boolean) {
  return on
    ? "border-accent-line bg-accent-soft text-text"
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
        transition: "stroke-dashoffset .3s ease .06s, stroke .3s ease",
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
  const fill = light ? "var(--color-text)" : "var(--color-accent)";
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center transition-all duration-300"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        border: `1.5px solid ${done ? fill : "rgba(255,255,255,0.2)"}`,
        background: done ? fill : "transparent",
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 16 16">
        <path
          d="M3.5 8.5l3 3 6-7"
          fill="none"
          stroke="var(--color-bg)"
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
