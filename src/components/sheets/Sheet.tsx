"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Bottom sheet on mobile, centred 440px dialog from 780px up (design: `shp`).
 * Closes on backdrop click and Escape; returns focus to the opener.
 */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]), textarea",
    );
    (first ?? ref.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 z-[65] bg-[rgb(5_6_7/0.62)] animate-[li-fade-in_.2s_ease]"
      />
      <div className="pointer-events-none absolute inset-0 z-[66] flex items-end justify-center desk:items-center">
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          tabIndex={-1}
          className="pointer-events-auto max-h-[88%] w-full overflow-y-auto rounded-t-3xl border border-line bg-sheet px-5 pt-2.5 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] outline-none animate-[li-slide-up_.32s_var(--ease-settle)] desk:w-[440px] desk:rounded-3xl desk:pb-6 desk:animate-[li-fade-up_.28s_ease]"
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-[18px] h-[5px] w-10 rounded-[3px] bg-line-bold"
          />
          {children}
        </div>
      </div>
    </>
  );
}
