/**
 * Sunlight and orientation for a locality — the native port of the web
 * SunlightCard.
 *
 * Pure astronomy: everything is computed from the locality's latitude and
 * longitude with SunCalc, so it is exact and needs no data pipeline. That is
 * why it renders in full even against an empty local database — unlike the
 * category cards, it depends on nothing but the coordinates.
 *
 * What it deliberately does not claim: whether a *specific* flat gets sun. That
 * depends on the floor and the buildings around it, which we have no reliable
 * height data for. So the card gives the sun's path for the locality and a
 * facing-direction helper, and says plainly where its knowledge stops.
 *
 * The `suncalc` build returns azimuth as a compass bearing in degrees from
 * north (0 = N, 90 = E, 180 = S, 270 = W) and altitude in degrees, so no radian
 * conversion is applied here — matching the web component exactly.
 */

import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import * as SunCalc from "suncalc";

import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

const SUN = "#EF9F27";

const COMPASS_16 = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

function compass(deg: number): string {
  return COMPASS_16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

// A Hermes-safe 12-hour formatter. React Native's toLocaleTimeString with
// options is unreliable on Android's engine, so the time is formatted by hand.
function fmt(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, "0")} ${ampm}`;
}

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
type Facing = (typeof DIRECTIONS)[number];

// Honest for Indian latitudes: the sun always rises in the east and sets in the
// west, so morning/afternoon exposure is certain; the midday direction (south,
// mostly) is where it is softer.
const FACING_LIGHT: Record<Facing, string> = {
  N: "Soft, even daylight and the least direct sun — the coolest exposure.",
  NE: "Gentle morning sun, then indirect light for most of the day.",
  E: "Strong morning sun; shaded, cooler afternoons.",
  SE: "Morning and midday sun — bright and warm.",
  S: "Sun through the middle of the day — the most consistent daylight all year.",
  SW: "Harsh afternoon sun; the hottest exposure in summer.",
  W: "Strong late-afternoon and evening sun; hot through the summer.",
  NW: "Indirect for most of the day, with some evening sun in summer.",
};

export function SunlightCard({
  name,
  lat,
  lon,
  slug,
}: {
  name: string;
  lat: number;
  lon: number;
  /** When set, the card offers a link to the full interactive shadow map. */
  slug?: string;
}) {
  const { t } = useI18n();
  const [facing, setFacing] = useState<Facing | null>(null);
  const { width: winW } = useWindowDimensions();

  const now = new Date();
  const times = SunCalc.getTimes(now, lat, lon);
  const sunrise = times.sunrise;
  const sunset = times.sunset;
  const solarNoon = times.solarNoon;

  // A bad coordinate (or a polar day/night, impossible for India) yields no
  // times. The guard also narrows the nullable types below.
  if (
    !sunrise ||
    !sunset ||
    !solarNoon ||
    Number.isNaN(sunrise.getTime()) ||
    Number.isNaN(sunset.getTime())
  ) {
    return null;
  }

  const riseAz = SunCalc.getPosition(sunrise, lat, lon).azimuth;
  const setAz = SunCalc.getPosition(sunset, lat, lon).azimuth;
  const noonAlt = SunCalc.getPosition(solarNoon, lat, lon).altitude;

  const dayMs = sunset.getTime() - sunrise.getTime();
  const dayH = Math.floor(dayMs / 3_600_000);
  const dayM = Math.round((dayMs % 3_600_000) / 60_000);

  // The seasonal swing: where the sunrise sits at the two solstices.
  const year = now.getFullYear();
  const summerRiseAt = SunCalc.getTimes(new Date(year, 5, 21), lat, lon).sunrise ?? sunrise;
  const winterRiseAt = SunCalc.getTimes(new Date(year, 11, 21), lat, lon).sunrise ?? sunrise;
  const summerRise = SunCalc.getPosition(summerRiseAt, lat, lon).azimuth;
  const winterRise = SunCalc.getPosition(winterRiseAt, lat, lon).azimuth;

  // Sun-height curve across today, sampled from the real position.
  const N = 40;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= N; i++) {
    const at = new Date(sunrise.getTime() + (dayMs * i) / N);
    const alt = Math.max(0, SunCalc.getPosition(at, lat, lon).altitude);
    // x: 24..296 across the daylight span. y: horizon at 92, scaled by 90°.
    pts.push({ x: 24 + (i / N) * 272, y: 92 - (alt / 90) * 74 });
  }
  const path = pts
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const isDay = now >= sunrise && now <= sunset;
  const nowFrac = Math.min(1, Math.max(0, (now.getTime() - sunrise.getTime()) / dayMs));
  const nowX = 24 + nowFrac * 272;
  const nowAlt = Math.max(0, SunCalc.getPosition(now, lat, lon).altitude);
  const nowY = 92 - (nowAlt / 90) * 74;

  // The SVG is authored in a 320×108 viewBox and scaled to the card's width.
  const svgW = Math.max(240, winW - 32 /* screen */ - 36 /* card padding */);
  const svgH = (svgW * 108) / 320;

  const facingText = facing
    ? t("facing." + facing) === "facing." + facing
      ? FACING_LIGHT[facing]
      : t("facing." + facing)
    : null;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{t("sun.header")}</Text>
      <Text style={styles.headline}>
        {t("sun.headline")
          .replace("{rise}", compass(riseAz))
          .replace("{set}", compass(setAz))
          .replace("{alt}", String(Math.round(noonAlt)))}
      </Text>

      {/* Sun-height curve for today, drawn from the real position. */}
      <Svg width={svgW} height={svgH} viewBox="0 0 320 108" style={{ marginTop: 16 }}>
        <Line x1="16" y1="92" x2="304" y2="92" stroke={theme.hairline} strokeWidth="1" />
        <Path d={path} fill="none" stroke={SUN} strokeWidth="2.5" strokeLinecap="round" />
        <Circle cx="24" cy="92" r="3" fill={SUN} />
        <Circle cx="296" cy="92" r="3" fill={SUN} />
        {isDay && (
          <Circle cx={nowX} cy={nowY} r="5" fill={SUN} stroke={theme.surface} strokeWidth="1.5" />
        )}
        <SvgText x="24" y="104" textAnchor="middle" fill={theme.inkMuted} fontSize="9">
          {fmt(sunrise)}
        </SvgText>
        <SvgText x="160" y="104" textAnchor="middle" fill={theme.inkMuted} fontSize="9">
          {t("sun.daylight").replace("{h}", String(dayH)).replace("{m}", String(dayM))}
        </SvgText>
        <SvgText x="296" y="104" textAnchor="middle" fill={theme.inkMuted} fontSize="9">
          {fmt(sunset)}
        </SvgText>
      </Svg>

      <View style={styles.statRow}>
        <Stat label={t("sun.sunrise")} value={fmt(sunrise)} sub={t("sun.inThe").replace("{dir}", compass(riseAz))} />
        <Stat label={t("sun.sunset")} value={fmt(sunset)} sub={t("sun.inThe").replace("{dir}", compass(setAz))} />
        <Stat label={t("sun.middaySun")} value={`${Math.round(noonAlt)}°`} sub={t("sun.aboveHorizon")} />
      </View>

      <Text style={styles.seasonal}>
        {t("sun.seasonal")
          .replace("{summer}", compass(summerRise))
          .replace("{winter}", compass(winterRise))}
      </Text>

      {/* Facing helper — the part a buyer actually decides on. */}
      <View style={styles.facingBlock}>
        <Text style={styles.facingTitle}>{t("sun.whichWay")}</Text>
        <View style={styles.facingRow}>
          {DIRECTIONS.map((d) => {
            const on = d === facing;
            return (
              <Pressable
                key={d}
                onPress={() => setFacing(on ? null : d)}
                style={[styles.dirBtn, on && styles.dirBtnOn]}
              >
                <Text style={[styles.dirText, on && styles.dirTextOn]}>{d}</Text>
              </Pressable>
            );
          })}
        </View>
        {facingText ? <Text style={styles.facingDesc}>{facingText}</Text> : null}
      </View>

      {slug ? (
        <Link
          href={{
            pathname: "/[slug]/sunlight",
            params: { slug, lat: String(lat), lon: String(lon), name },
          }}
          asChild
        >
          <Pressable style={styles.mapBtn}>
            <Icon name="map" size={18} color="#ffffff" />
            <Text style={styles.mapBtnText}>{t("sun.openMap")}</Text>
          </Pressable>
        </Link>
      ) : null}

      <Text style={styles.footer}>{t("sun.footer").replace("{name}", name)}</Text>
    </View>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statSub}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: theme.hairline,
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 18,
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: theme.brand,
  },
  headline: {
    fontSize: 14.5,
    fontWeight: "600",
    lineHeight: 20,
    color: theme.ink,
    marginTop: 4,
  },
  statRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  stat: {
    flex: 1,
    backgroundColor: theme.plane,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  statLabel: {
    fontSize: 9.5,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: theme.inkMuted,
  },
  statValue: { fontSize: 15, fontWeight: "800", color: theme.ink, marginTop: 3 },
  statSub: { fontSize: 10, lineHeight: 13, color: theme.inkSecondary, marginTop: 3 },
  seasonal: { fontSize: 11.5, lineHeight: 18, color: theme.inkSecondary, marginTop: 12 },
  facingBlock: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.hairline,
    paddingTop: 16,
  },
  facingTitle: { fontSize: 11.5, fontWeight: "600", color: theme.ink },
  facingRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  dirBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: theme.plane,
  },
  dirBtnOn: { backgroundColor: theme.brand },
  dirText: { fontSize: 12, fontWeight: "500", color: theme.inkSecondary },
  dirTextOn: { color: "#ffffff" },
  facingDesc: {
    marginTop: 10,
    borderRadius: 16,
    backgroundColor: theme.brandSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 12,
    lineHeight: 18,
    color: theme.ink,
  },
  footer: { fontSize: 10.5, lineHeight: 16, color: theme.inkMuted, marginTop: 16 },
  mapBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    backgroundColor: theme.brand,
    borderRadius: 999,
    paddingVertical: 12,
  },
  mapBtnText: { fontSize: 14, fontWeight: "700", color: "#ffffff" },
});
