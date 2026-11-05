"use client";

/**
 * The native app's bottom tab bar, brought to the web so the two products read
 * as one: Home, Explore, Map, Saved, Profile. Fixed to the bottom, active tab in
 * the brand colour. The page already reserves space for it (padding on <body>),
 * and it sits above the safe-area inset on phones.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";

const TABS: { label: string; href: string; icon: IconName; match: (p: string) => boolean }[] = [
  { label: "Home", href: "/", icon: "home", match: (p) => p === "/" },
  { label: "Explore", href: "/localities", icon: "search", match: (p) => p.startsWith("/localities") },
  { label: "Map", href: "/coverage", icon: "map", match: (p) => p.startsWith("/coverage") },
  { label: "Saved", href: "/shortlist", icon: "bookmark", match: (p) => p.startsWith("/shortlist") },
  { label: "Profile", href: "/about", icon: "user", match: (p) => p.startsWith("/about") || p.startsWith("/privacy") },
];

export function BottomTabBar() {
  const pathname = usePathname() || "/";
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-surface-1/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-3xl items-stretch justify-around px-2">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.label}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 pt-2.5"
            >
              <Icon
                name={tab.icon}
                size={22}
                color={active ? "var(--color-brand)" : "var(--color-ink-muted)"}
                filled={active && tab.icon === "bookmark"}
              />
              <span
                className="text-[10px] font-semibold"
                style={{ color: active ? "var(--color-brand)" : "var(--color-ink-muted)" }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
