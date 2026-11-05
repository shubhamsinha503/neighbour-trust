import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";

/**
 * A friendly, centred empty state — a soft-tinted glyph, a title, a line of
 * explanation and an optional call to action. Mirrors the native app's
 * EmptyState so a page with nothing to show still reads as the product rather
 * than a blank screen.
 */
export function EmptyState({
  icon,
  title,
  message,
  ctaLabel,
  ctaHref,
}: {
  icon: IconName;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  return (
    <div className="mt-12 flex flex-col items-center px-6 text-center">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
        <Icon name={icon} size={28} color="var(--color-brand)" />
      </span>
      <h2 className="text-[16px] font-bold text-ink-primary">{title}</h2>
      <p className="mt-1.5 max-w-xs text-[13px] leading-[1.6] text-ink-secondary">{message}</p>
      {ctaHref && ctaLabel && (
        <Link
          href={ctaHref}
          className="mt-5 rounded-xl bg-brand px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
