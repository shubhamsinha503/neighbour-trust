import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";

/**
 * The "What matters in your neighbourhood?" grid, mirroring the mobile home
 * (apps/mobile/app/(tabs)/index). Eight category tiles — a soft-tinted glyph,
 * a label and a sub-label. They route into the browse/search list; none invent
 * a score.
 */
const CATEGORIES: { label: string; sub: string; icon: IconName; color: string; href: string }[] = [
  { label: "Safety", sub: "Crime & security", icon: "shield", color: "#F72575", href: "/localities" },
  { label: "Air quality", sub: "AQI & pollution", icon: "leaf", color: "#1B9362", href: "/localities" },
  { label: "Water", sub: "Supply & quality", icon: "drop", color: "#06B6D4", href: "/localities" },
  { label: "Connectivity", sub: "Commute & transit", icon: "bus", color: "#7C3AED", href: "/localities" },
  { label: "Schools", sub: "Access & options", icon: "book", color: "#2563EB", href: "/localities" },
  { label: "Healthcare", sub: "Facilities nearby", icon: "plus", color: "#DC2626", href: "/localities" },
  { label: "Green spaces", sub: "Parks & open space", icon: "tree", color: "#16A34A", href: "/localities" },
  { label: "Sun & shadow", sub: "Light & orientation", icon: "sun", color: "#EA580C", href: "/localities" },
];

export function WhatMatters() {
  return (
    <section className="mt-9">
      <h2 className="text-[18px] font-bold tracking-[-0.01em] text-ink-primary">
        What matters in your neighbourhood?
      </h2>
      <p className="mt-1 text-[13.5px] text-ink-secondary">
        Explore the factors that make a great place to live.
      </p>
      <div className="mt-3.5 grid grid-cols-4 gap-2.5">
        {CATEGORIES.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-hairline bg-surface-1 px-1.5 py-3.5 text-center transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-[13px]"
              style={{ backgroundColor: c.color + "1F" }}
            >
              <Icon name={c.icon} size={20} color={c.color} />
            </span>
            <span className="text-[11.5px] font-bold leading-tight text-ink-primary">{c.label}</span>
            <span className="text-[9.5px] leading-tight text-ink-muted">{c.sub}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
