import type { IconName } from "@/components/ui/Icon";

/** The glyph shown beside each category in the Insights list. */
const MAP: Record<string, IconName> = {
  schools: "book",
  crime: "shield",
  air_quality: "leaf",
  water: "drop",
  infrastructure: "bus",
  power: "bus",
  development: "building",
};

export function categoryIcon(category: string): IconName {
  return MAP[category] ?? "info";
}
