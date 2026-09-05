import type { MetadataRoute } from "next";

import { fetchLocalities } from "@/lib/api";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://neighbour-trust-virid.vercel.app";

/**
 * Sitemap.
 *
 * Locality pages are the whole search surface — someone types "is Whitefield
 * safe to live in", not "neighbourhood data platform" — so they need to be
 * discoverable individually rather than only through the index.
 *
 * Built from the live locality list so adding a locality adds it to the sitemap
 * with no second step to forget.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const fixed: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const localities = await fetchLocalities().catch(() => []);

  return [
    ...fixed,
    ...localities.flatMap((locality) => [
      {
        url: `${SITE_URL}/${locality.slug}`,
        lastModified: now,
        // Air quality changes hourly, so the report genuinely changes daily.
        changeFrequency: "daily" as const,
        priority: 0.8,
      },
      {
        url: `${SITE_URL}/${locality.slug}/air-quality`,
        lastModified: now,
        changeFrequency: "daily" as const,
        priority: 0.6,
      },
      {
        url: `${SITE_URL}/${locality.slug}/schools`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      },
    ]),
  ];
}
