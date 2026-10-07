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

/** Character palette from the approved reference, independent of UI accents. */
export const ROOK_COLORS = {
  graphite: "#0d0f12",
  charcoal: "#1f2429",
  slate: "#3a4148",
  light: "#a7afb7",
  sclera: "#f3f1ea",
  green: "#00e676",
  mint: "#7cffb3",
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
  const y = 57;
  if (pose.eyes === "happy")
    return (
      <path
        d={`M${x - 9} ${y + 3}Q${x} ${y - 9} ${x + 9} ${y + 3}`}
        stroke={C.graphite}
        strokeWidth="4.2"
        strokeLinecap="round"
        fill="none"
      />
    );
  // The inner corner is the one towards the beak.
  const [inner, outer] = pose.eyes === "half" ? [15, 15] : pose.lid;
  const top = y - 20;
  // The white itself follows the brow: no circular eye peeking above a lid.
  const outline = `M${x - side * 14} ${top + outer}
    Q${x - side * 11} ${top + outer - 2} ${x + side * 15} ${top + inner + 5}
    C${x + side * 19} ${y + 22} ${x - side * 19} ${y + 24} ${x - side * 17} ${y - 1}
    Q${x - side * 17} ${top + outer + 3} ${x - side * 14} ${top + outer}Z`;
  return (
    <g>
      <clipPath id={id}>
        <path d={outline} />
      </clipPath>
      <path d={outline} fill={C.sclera} stroke={C.graphite} strokeWidth="1.2" />
      <g clipPath={`url(#${id})`}>
        <g {...move("0 0", `translate(${pose.look[0]}px, ${pose.look[1]}px)`)}>
          <ellipse
            cx={x + side * 3}
            cy={y + 1.5}
            rx="10.5"
            ry="13"
            fill={C.green}
          />
          <ellipse
            cx={x + side * 3}
            cy={y - 1}
            rx="8.3"
            ry="10.7"
            fill="#08090b"
          />
          <ellipse
            cx={x + side * 3 + 3}
            cy={y - 6}
            rx="2.5"
            ry="3.2"
            fill="#fff"
          />
        </g>
        <path
          d={`M${x - side * 16} ${top + outer + 1}Q${x - side * 11} ${top + outer - 2} ${x + side * 16} ${top + inner + 5}`}
          fill="none"
          stroke={C.graphite}
          strokeWidth="5"
        />
      </g>
    </g>
  );
}

/** One layered wing, mirrored by its parent, with a stable shoulder pivot. */
function Wing({ fill }: { fill: string }) {
  return (
    <g fill={fill} stroke={C.graphite} strokeWidth=".8" strokeLinejoin="round">
      <path d="M32 71C17 71 10 87 15 101Q18 104 24 98Q23 106 29 104C40 97 42 79 32 71Z" />
      <path d="M29 76C20 81 14 92 13 98Q19 100 26 92Q21 104 27 102C35 98 38 87 35 80Z" />
      <path d="M31 71C21 71 16 80 14 88Q19 92 26 86Q21 96 27 95C35 92 39 77 31 71Z" />
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
  const feather = `rf${uid}`;
  const head =
    "M60 28C85 28 101 44 103 64L107 71Q103 77 96 78C82 84 38 84 24 78Q17 77 13 71L19 64C21 43 36 28 60 28Z";
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={cx("shrink-0 overflow-visible", className)}
      data-rook={pose}
      focusable="false"
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true, focusable: false })}
    >
      <defs>
        <radialGradient id={body} cx="35%" cy="18%" r="85%">
          <stop offset="0" stopColor={C.slate} />
          <stop offset=".6" stopColor={C.charcoal} />
          <stop offset="1" stopColor={C.graphite} />
        </radialGradient>
        <linearGradient id={feather} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={C.slate} />
          <stop offset="1" stopColor={C.graphite} />
        </linearGradient>
        <linearGradient id={rim} x1="0%" y1="0%" x2="100%" y2="80%">
          <stop stopColor={C.mint} stopOpacity=".8" />
          <stop offset=".45" stopColor={C.light} stopOpacity=".15" />
          <stop offset="1" stopColor={C.mint} stopOpacity=".3" />
        </linearGradient>
        <filter id={glow} x="-100%" y="-50%" width="300%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <g
        data-part="posture"
        {...move("60px 110px", `translateY(${p.drop}px) rotate(${p.tilt}deg)`)}
      >
        {/* feet */}
        <g data-part="feet" fill={C.light} stroke={C.graphite} strokeWidth=".8">
          <path d="M33 113Q34 104 44 104Q54 104 55 113ZM65 113Q66 104 76 104Q86 104 87 113Z" />
          <path
            d="M40 107Q38 109 38 113M48 107Q51 109 51 113M72 107Q69 109 69 113M80 107Q82 109 82 113"
            fill="none"
          />
        </g>
        <g data-part="body">
          <path
            d="M31 65Q60 56 89 65C99 88 89 109 60 109S21 88 31 65Z"
            fill={`url(#${body})`}
            stroke={`url(#${rim})`}
            strokeWidth=".8"
          />
          <path
            d="M37 76Q60 82 83 76Q78 100 60 104Q42 100 37 76Z"
            fill={C.slate}
            opacity=".35"
          />
        </g>
        <g
          data-part="wing-left"
          {...move("32px 74px", `rotate(${p.wings}deg)`)}
        >
          <Wing fill={`url(#${feather})`} />
        </g>
        <g
          data-part="wing-right"
          {...move("88px 74px", `rotate(${-p.wings}deg)`)}
        >
          <g transform="translate(120 0) scale(-1 1)">
            <Wing fill={`url(#${feather})`} />
          </g>
        </g>
        <g data-part="head">
          <path
            d={head}
            fill={`url(#${body})`}
            stroke={`url(#${rim})`}
            strokeWidth=".9"
          />
        </g>
        {/* Three distinct feathers: short left, upright right, tall swept centre. */}
        <g
          data-part="crest"
          fill={`url(#${feather})`}
          stroke={`url(#${rim})`}
          strokeWidth=".8"
          strokeLinejoin="round"
        >
          <path d="M57 36C42 32 32 24 34 18C44 16 56 24 61 35Z" />
          <path d="M63 37C64 27 68 18 75 14C81 24 77 33 68 39Z" />
          <path d="M63 38C51 29 43 15 46 4C63 7 71 21 63 38Z" />
          <path
            d="M46 4Q57 21 63 38Q49 28 46 4"
            fill={C.graphite}
            stroke="none"
            opacity=".5"
          />
        </g>
        {/* eyes */}
        <g data-part="eyes">
          <Eye cx={40.5} side={1} pose={p} id={`re1${uid}`} />
          <Eye cx={79.5} side={-1} pose={p} id={`re2${uid}`} />
        </g>
        {/* beak */}
        {p.beak === "closed" ? (
          <g data-part="beak">
            <path
              d="M52 68Q54 61 60 61Q66 61 68 68Q66 75 60 78Q54 75 52 68Z"
              fill={C.light}
            />
            <path d="M52 68L68 68Q66 75 60 78Q55 74 52 68Z" fill="#727a82" />
            <path d="M52 68Q54 61 60 61L62 70Z" fill={C.sclera} opacity=".65" />
          </g>
        ) : (
          <g data-part="beak">
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
        <g data-part="proof-core">
          <rect
            x="54"
            y="83"
            width="12"
            height="21"
            rx="6"
            fill="#07080a"
            stroke={C.green}
            strokeWidth="1"
          />
          <rect
            x="55.5"
            y="84"
            width="9"
            height="18"
            rx="4.5"
            fill={C.green}
            filter={`url(#${glow})`}
            opacity={p.core * 0.9}
            className="transition-opacity duration-300 motion-reduce:transition-none"
          />
          <rect
            x="57.3"
            y="86.5"
            width="5.4"
            height="14"
            rx="2.7"
            fill={C.mint}
            opacity={0.55 + p.core * 0.45}
            className="transition-opacity duration-300 motion-reduce:transition-none"
          />
        </g>
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
