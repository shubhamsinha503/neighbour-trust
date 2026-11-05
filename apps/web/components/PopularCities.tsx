import Link from "next/link";
import { CityBadge } from "@/components/CityBadge";
import { Icon } from "@/components/Icon";

/**
 * Horizontal "Popular cities" rail, mirroring the mobile home. Each card shows a
 * pastel landmark illustration, the city name and its locality count, and links
 * into that city's localities. Counts come from the same list the search runs
 * over, so they cannot disagree.
 */
export function PopularCities({ cities }: { cities: { city: string; count: number }[] }) {
  return (
    <section className="mt-8">
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="text-[18px] font-bold tracking-[-0.01em] text-ink-primary">Popular cities</h2>
        <Link href="/localities" className="flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
          Browse all <Icon name="arrowRight" size={14} color="currentColor" />
        </Link>
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cities.map((c, i) => (
          <Link
            key={c.city}
            href={`/localities?city=${encodeURIComponent(c.city)}`}
            className="w-[132px] shrink-0 overflow-hidden rounded-[20px] border border-hairline bg-surface-1 pb-3 transition-shadow hover:shadow-[0_6px_20px_rgba(16,33,58,0.08)]"
          >
            <CityBadge variant={i} height={74} />
            <div className="mt-2.5 truncate px-3 text-[14px] font-bold text-ink-primary">{c.city}</div>
            <div className="mt-0.5 px-3 text-[11.5px] font-medium text-ink-muted">{c.count} localities</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
