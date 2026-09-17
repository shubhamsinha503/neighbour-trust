/**
 * The Neighbour Trust mark: a checkmark inside a location pin — "a place you
 * can trust." White glyph on the brand badge; the check is knocked out in the
 * brand colour so it reads on any brand hue (change --color-brand and the mark
 * follows).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl bg-brand text-white ${
        className ?? "h-[34px] w-[34px]"
      }`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-[64%] w-[64%]">
        <path
          d="M12 2.2c-4.3 0-7.6 3.3-7.6 7.5 0 5.2 7.6 12.1 7.6 12.1s7.6-6.9 7.6-12.1c0-4.2-3.3-7.5-7.6-7.5Z"
          fill="currentColor"
        />
        <path
          d="m8.7 9.9 2.3 2.4 4-4.3"
          stroke="var(--color-brand)"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
