import { useId } from "react";
import { cx } from "@/components/ui";

/**
 * ROOK — "the proof keeper", the LOCKED IN mascot (docs/ROOK.md). An
 * original vector of the approved character sheet: a compact graphite corvid
 * seen from the front, a three-feather crest, big focused eyes, a small grey
 * beak, side wings, grey feet and the PROOF CORE — the glowing pill on the
 * chest. A pose only swaps a few parts (eyes, beak) and moves others
 * (wings, irises, the whole bird) with transforms, so changes between poses
 * are CSS transitions; reduced motion makes them instant. Decorative by
 * default: the words next to Rook carry the message, so the SVG is
 * aria-hidden unless a `label` is given.
 */
export type RookPose =
  | "neutral"
  | "focused"
  | "ready"
  | "proud"
  | "celebrating"
  | "watching"
  | "supportive"
  | "tired"
  | "reviewing";

export const ROOK_POSES: RookPose[] = [
  "neutral",
  "focused",
  "ready",
  "proud",
  "celebrating",
  "watching",
  "supportive",
  "tired",
  "reviewing",
];

type Eyes = "open" | "happy" | "half";
type Pose = {
  eyes: Eyes;
  /** Lid depth into the eye: inner corner / outer corner (0 = no lid). */
  lid: [number, number];
  /** Where the irises look (units of the 120 grid). */
  look: [number, number];
  /** Wings: degrees from resting (+ = lifted outwards). */
  wings: number;
  beak: "closed" | "open";
  /** Proof core brightness 0..1. */
  core: number;
  /** Whole bird: tilt (deg) and drop (units). */
  tilt: number;
  drop: number;
  extra?: "heart" | "spark";
};

const POSES: Record<RookPose, Pose> = {
  neutral: {
    eyes: "open",
    lid: [8, 4],
    look: [0, 0],
    wings: 0,
    beak: "closed",
    core: 0.7,
    tilt: 0,
    drop: 0,
  },
  focused: {
    eyes: "open",
    lid: [12, 5],
    look: [0, 1],
    wings: 0,
    beak: "closed",
    core: 0.8,
    tilt: 0,
    drop: 0,
  },
  ready: {
    eyes: "open",
    lid: [6, 2],
    look: [0, -1],
    wings: 10,
    beak: "closed",
    core: 0.85,
    tilt: 0,
    drop: -1,
  },
  proud: {
    eyes: "happy",
    lid: [0, 0],
    look: [0, 0],
    wings: 14,
    beak: "closed",
    core: 1,
    tilt: 0,
    drop: -2,
  },
  celebrating: {
    eyes: "happy",
    lid: [0, 0],
    look: [0, 0],
    wings: 62,
    beak: "open",
    core: 1,
    tilt: 0,
    drop: -3,
    extra: "spark",
  },
  watching: {
    eyes: "open",
    lid: [5, 2],
    look: [0, -3],
    wings: -6,
    beak: "closed",
    core: 0.55,
    tilt: 0,
    drop: 8,
  },
  supportive: {
    eyes: "happy",
    lid: [0, 0],
    look: [0, 0],
    wings: 6,
    beak: "closed",
    core: 0.9,
    tilt: 0,
    drop: 0,
    extra: "heart",
  },
  tired: {
    eyes: "half",
    lid: [0, 0],
    look: [0, 2],
    wings: -8,
    beak: "closed",
    core: 0.4,
    tilt: 0,
    drop: 2,
  },
  reviewing: {
    eyes: "open",
    lid: [9, 3],
    look: [3, -2],
    wings: 0,
    beak: "closed",
    core: 0.7,
    tilt: -7,
    drop: 0,
  },
};

/** Palette of the character sheet; green = the app's LOCKED green. */
export const ROOK_COLORS = {
  graphite: "#0d0f12",
  charcoal: "#1f2429",
  slate: "#3a4148",
  light: "#a7afb7",
  sclera: "#f3f1ea",
  green: "#c6e07b",
};
const C = ROOK_COLORS;

const move = (origin: string, transform: string) => ({
  style: {
    transformBox: "view-box" as const,
    transformOrigin: origin,
    transform,
  },
  className:
    "transition-transform duration-300 ease-[var(--ease-settle)] motion-reduce:transition-none",
});

function Eye({
  cx: x,
  side,
  pose,
  id,
}: {
  cx: number;
  side: 1 | -1;
  pose: Pose;
  id: string;
}) {
  const y = 55;
  if (pose.eyes === "happy")
    return (
      <path
        d={`M${x - 9} ${y + 3}Q${x} ${y - 9} ${x + 9} ${y + 3}`}
        stroke={C.sclera}
        strokeWidth="4.2"
        strokeLinecap="round"
        fill="none"
      />
    );
  // The inner corner is the one towards the beak.
  const [inner, outer] = pose.eyes === "half" ? [15, 15] : pose.lid;
  const innerX = x + side * 16;
  const outerX = x - side * 16;
  const top = y - 17;
  return (
    <g>
      <clipPath id={id}>
        <ellipse cx={x} cy={y} rx="14" ry="15.5" />
      </clipPath>
      <ellipse cx={x} cy={y} rx="14" ry="15.5" fill={C.sclera} />
      <g clipPath={`url(#${id})`}>
        <g {...move("0 0", `translate(${pose.look[0]}px, ${pose.look[1]}px)`)}>
          <circle cx={x + side * 2} cy={y + 2} r="10" fill={C.green} />
          <circle cx={x + side * 2} cy={y + 0.6} r="8.2" fill="#08090b" />
          <circle cx={x + side * 2 - 2.8} cy={y - 3.4} r="2.6" fill="#fff" />
          <circle cx={x + side * 2 + 2.6} cy={y + 3} r="1.1" fill="#fff" />
        </g>
        <path
          d={`M${innerX} ${top - 8}L${outerX} ${top - 8}L${outerX} ${top + outer}L${innerX} ${top + inner}Z`}
          fill={C.graphite}
        />
      </g>
    </g>
  );
}

export function Rook({
  pose = "neutral",
  size = 96,
  label,
  className,
}: {
  pose?: RookPose;
  size?: number;
  /** Only when Rook himself carries meaning (otherwise decorative). */
  label?: string;
  className?: string;
}) {
  const p = POSES[pose];
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const body = `rb${uid}`;
  const glow = `rg${uid}`;
  const rim = `rr${uid}`;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={cx("shrink-0 overflow-visible", className)}
      data-rook={pose}
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true, focusable: false })}
    >
      <defs>
        <radialGradient id={body} cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor={C.charcoal} />
          <stop offset=".6" stopColor="#14171b" />
          <stop offset="1" stopColor={C.graphite} />
        </radialGradient>
        <linearGradient id={rim} x1="0" y1="0" x2="1" y2="1">
          <stop offset=".35" stopColor={C.green} stopOpacity="0" />
          <stop offset="1" stopColor={C.green} stopOpacity=".55" />
        </linearGradient>
        <filter id={glow} x="-100%" y="-50%" width="300%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <g
        {...move("60px 110px", `translateY(${p.drop}px) rotate(${p.tilt}deg)`)}
      >
        {/* wings (behind the body edge) */}
        <g {...move("33px 62px", `rotate(${p.wings}deg)`)}>
          <path
            d="M33 58C17 62 9 78 11 97c3.5-1.2 6-3.4 7.6-6.3.4 3.8 2.2 6.8 5 8.5 1.2-3.4 1.8-6.4 1.9-9 1.6 2.8 3.6 4.7 6.4 5.6C34 83 35 70 33 58z"
            fill="#262b31"
          />
        </g>
        <g {...move("87px 62px", `rotate(${-p.wings}deg)`)}>
          <path
            d="M87 58c16 4 24 20 22 39-3.5-1.2-6-3.4-7.6-6.3-.4 3.8-2.2 6.8-5 8.5-1.2-3.4-1.8-6.4-1.9-9-1.6 2.8-3.6 4.7-6.4 5.6C86 83 85 70 87 58z"
            fill="#262b31"
          />
        </g>
        {/* body */}
        <path
          d="M60 21c25 0 40 21 40 45 0 24-16 40-40 40S20 90 20 66c0-24 15-45 40-45z"
          fill={`url(#${body})`}
        />
        <path
          d="M60 21c25 0 40 21 40 45 0 24-16 40-40 40S20 90 20 66c0-24 15-45 40-45z"
          fill="none"
          stroke={`url(#${rim})`}
          strokeWidth="1.4"
        />
        {/* feet */}
        <g fill="#8b9299">
          <path d="M40 108.5c0-3.4 3.8-5.5 8.5-5.5s8.5 2.1 8.5 5.5c0 1.7-1.2 2.5-3 2.5H43c-1.8 0-3-.8-3-2.5z" />
          <path d="M63 108.5c0-3.4 3.8-5.5 8.5-5.5s8.5 2.1 8.5 5.5c0 1.7-1.2 2.5-3 2.5H66c-1.8 0-3-.8-3-2.5z" />
        </g>
        {/* crest: three feathers growing from the head */}
        <g fill="#191c21">
          <path d="M50 30c-9-5-13.5-14-12.5-25 8 4.5 13.5 12 16 22z" />
          <path d="M55.5 28c-3-10-1.4-20 5.5-28 4 10 3.4 19.5-.5 28z" />
          <path d="M61.5 29c2.4-9.5 8.4-16 17.5-19-.8 9.6-6 16.6-13.5 21z" />
        </g>
        {/* eyes */}
        <Eye cx={44.5} side={1} pose={p} id={`re1${uid}`} />
        <Eye cx={75.5} side={-1} pose={p} id={`re2${uid}`} />
        {/* beak */}
        {p.beak === "closed" ? (
          <g>
            <path
              d="M52.5 64c2.4-1.8 5-2.6 7.5-2.6s5.1.8 7.5 2.6l-6.3 10.4c-.6 1-1.8 1-2.4 0z"
              fill={C.light}
            />
            <path
              d="M55.4 68.6h9.2l-3.4 5.8c-.6 1-1.8 1-2.4 0z"
              fill="#727a82"
            />
          </g>
        ) : (
          <g>
            <path
              d="M52.5 62.5c2.4-1.8 5-2.6 7.5-2.6s5.1.8 7.5 2.6l-3 4.4h-9z"
              fill={C.light}
            />
            <path
              d="M55.6 67.3h8.8l-3.2 8c-.5 1.1-2 1.1-2.4 0z"
              fill="#4a2a2a"
            />
            <path
              d="M57.4 71.6h5.2l-1.4 3.6c-.5 1.1-2 1.1-2.4 0z"
              fill="#d9776a"
            />
            <path
              d="M55.6 67.3h8.8"
              stroke={C.light}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </g>
        )}
        {/* proof core */}
        <rect
          x="54"
          y="79"
          width="12"
          height="22"
          rx="6"
          fill="#07080a"
          stroke={C.slate}
          strokeWidth="1"
        />
        <rect
          x="55.5"
          y="81"
          width="9"
          height="18"
          rx="4.5"
          fill={C.green}
          filter={`url(#${glow})`}
          opacity={p.core * 0.9}
          className="transition-opacity duration-300"
        />
        <rect
          x="57.3"
          y="83"
          width="5.4"
          height="14"
          rx="2.7"
          fill={C.green}
          opacity={0.55 + p.core * 0.45}
          className="transition-opacity duration-300"
        />
        {p.extra === "heart" && (
          <path
            d="M101 26c-2.6-3.4-8-1.6-8 2.6 0 3.2 3.6 5.8 8 9 4.4-3.2 8-5.8 8-9 0-4.2-5.4-6-8-2.6z"
            fill={C.green}
          />
        )}
        {p.extra === "spark" && (
          <g stroke={C.green} strokeWidth="3" strokeLinecap="round">
            <path d="M24 22l4 5M18 34l6 2M96 22l-4 5M102 34l-6 2" />
          </g>
        )}
      </g>
    </svg>
  );
}

/** Two small Rooks side by side — the duo (never the users as mascots). */
export function RookDuo({ size = 56 }: { size?: number }) {
  return (
    <span aria-hidden="true" className="inline-flex items-end">
      <Rook pose="watching" size={size} />
      <Rook pose="neutral" size={size * 0.9} className="-ml-[14%]" />
    </span>
  );
}
