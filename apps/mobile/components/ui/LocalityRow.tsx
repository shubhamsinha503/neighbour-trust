import * as Haptics from "expo-haptics";
import { Link } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { CityBadge } from "@/components/ui/CityBadge";
import { Icon } from "@/components/ui/Icon";
import { PressableScale } from "@/components/ui/PressableScale";
import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import { useSaved } from "@/src/saved";
import type { LocalitySummary } from "@/src/api";
import { radius, scoreColor, theme } from "@/src/theme";

/** Stable 0–4 illustration variant from the slug (no image assets, honest filler). */
function variantFor(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h + slug.charCodeAt(i)) % 5;
  return h;
}

/** A score-band label — a plain restatement of the trust score, never a new claim. */
function band(score: number | null): { key: string; color: string } {
  if (score === null) return { key: "band.unscored", color: theme.inkMuted };
  const color = scoreColor(score);
  if (score >= 80) return { key: "band.high", color };
  if (score >= 70) return { key: "band.good", color };
  if (score >= 60) return { key: "band.fair", color };
  return { key: "band.mixed", color };
}

/**
 * One tappable locality card: an illustrated thumbnail, the name and
 * "city, state", a colour-banded trust score, and up to two honest chips — the
 * score band plus either the locality's top flag (the warning a buyer scans for)
 * or how much of it is documented. A heart toggles saved without navigating.
 * All imagery is SVG illustration; no invented scores or fabricated photos.
 */
export function LocalityRow({ item }: { item: LocalitySummary }) {
  const { t } = useI18n();
  const { isSaved, toggle } = useSaved();
  const saved = isSaved(item.slug);

  const b = band(item.score);
  const flag = item.top_flag;
  const flagColor = flag?.severity === "serious" ? theme.bad : theme.warn;
  const flagSoft = flag?.severity === "serious" ? theme.badSoft : theme.warnSoft;
  const place = [item.city, item.state].filter(Boolean).join(", ");
  const coverage =
    item.categories_with_data > 0
      ? t("card.documented").replace("{n}", String(item.categories_with_data))
      : t("card.dataLimited");

  return (
    <Link href={`/${item.slug}`} asChild>
      <PressableScale style={styles.card}>
        <View style={styles.row}>
          <View style={styles.thumb}>
            <CityBadge variant={variantFor(item.slug)} height={96} />
          </View>

          <View style={styles.body}>
            <View style={styles.topLine}>
              <Txt weight="bold" style={styles.name} numberOfLines={1}>
                {item.name}
              </Txt>
              <Pressable
                hitSlop={10}
                onPress={() => {
                  void Haptics.selectionAsync();
                  toggle(item.slug);
                }}
              >
                <Icon name="heart" size={20} color={saved ? theme.brand : theme.inkMuted} filled={saved} />
              </Pressable>
            </View>

            <Txt style={styles.place} numberOfLines={1}>
              {place}
            </Txt>

            <View style={styles.chipsRow}>
              <View style={[styles.scorePill, { backgroundColor: b.color + "1A" }]}>
                <Txt weight="extrabold" style={[styles.scoreNum, { color: b.color }]}>
                  {item.score ?? "—"}
                </Txt>
              </View>
              <View style={styles.chip}>
                <Txt weight="semibold" style={[styles.chipText, { color: b.color }]} numberOfLines={1}>
                  {t(b.key)}
                </Txt>
              </View>
              {flag ? (
                <View style={[styles.chip, { backgroundColor: flagSoft }]}>
                  <Txt weight="semibold" style={[styles.chipText, { color: flagColor }]} numberOfLines={1}>
                    {flag.headline}
                  </Txt>
                </View>
              ) : (
                <View style={styles.chip}>
                  <Txt weight="medium" style={styles.chipText} numberOfLines={1}>
                    {coverage}
                  </Txt>
                </View>
              )}
            </View>
          </View>

          <Icon name="chevron" size={18} color={theme.inkMuted} />
        </View>
      </PressableScale>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: radius.lg,
    marginBottom: 10,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingRight: 12 },
  thumb: { width: 104, height: 96, borderRadius: radius.md, overflow: "hidden", margin: 8 },
  body: { flex: 1, gap: 3, paddingVertical: 12 },
  topLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flex: 1, fontSize: 16, color: theme.ink },
  place: { fontSize: 12.5, color: theme.inkMuted },
  chipsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 4 },
  scorePill: {
    minWidth: 34,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9,
    alignItems: "center",
  },
  scoreNum: { fontSize: 14 },
  chip: {
    backgroundColor: theme.plane,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: 150,
  },
  chipText: { fontSize: 11.5, color: theme.inkSecondary },
});
