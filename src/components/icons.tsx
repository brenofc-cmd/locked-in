/** Tab icons, copied from the design's inline SVGs. */
const stroke = { stroke: "currentColor", strokeWidth: 1.6 };

export function TodayIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      style={stroke}
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="15" height="15" rx="4.5" />
      <path
        d="M7.6 11.2l2.4 2.4 4.5-5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PartnerIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      style={stroke}
      aria-hidden="true"
    >
      <circle cx="8" cy="8.5" r="3" />
      <circle cx="15" cy="8.5" r="3" />
      <path
        d="M2.8 18c.6-2.6 2.6-4 5.2-4s4.6 1.4 5.2 4M14.2 14c.3 0 .5 0 .8 0 2.6 0 4.6 1.4 5.2 4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FocusIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      style={stroke}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7.5" />
      <circle cx="11" cy="11" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ProgressIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      style={stroke}
      aria-hidden="true"
    >
      <path
        d="M5 18v-6M11 18V5M17 18v-9"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function PlanIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      style={stroke}
      aria-hidden="true"
    >
      <rect x="3.5" y="4.5" width="15" height="14" rx="3.5" />
      <path d="M3.5 9h15M7.5 2.8v3.4M14.5 2.8v3.4" strokeLinecap="round" />
    </svg>
  );
}

/** The ring-with-dot glyph inside the LOCK IN buttons. */
export function LockGlyph() {
  return (
    <span
      aria-hidden="true"
      className="flex size-[13px] items-center justify-center rounded-full border-2 border-bg"
    >
      <span className="size-[3px] rounded-full bg-bg" />
    </span>
  );
}
