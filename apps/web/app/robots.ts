import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://neighbour-trust-virid.vercel.app";

/**
 * robots.txt.
 *
 * Everything public is open to crawlers — search is the channel this product is
 * shaped for, since a locality report answers a question people already type.
 * /offline is excluded: it is a service-worker fallback, not a page anyone
 * should reach from a search result.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/offline"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
