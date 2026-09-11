/**
 * The image a shared locality link unfurls into.
 *
 * Home buying in India is a family decision, so a report is forwarded far more
 * often than it is found — into a WhatsApp group, usually, where the preview is
 * the whole message. Until now that preview was a line of text and no image,
 * which in a group chat reads as a link somebody could not be bothered to
 * explain.
 *
 * So the card carries the finding rather than the branding: the score, what it
 * rests on, and the two things we actually found. Someone should be able to
 * decide whether to tap from the preview alone, and the ones who do not tap
 * still learn something true about the neighbourhood.
 *
 * **It says what the number covers.** A score in isolation invites the reading
 * this product spends most of its effort refusing — that somebody rated this
 * neighbourhood 78 out of 100. "From 4 of 5 categories" is the smallest honest
 * qualifier that fits, and it travels with the number into a chat where nobody
 * will read a caveat further down.
 *
 * Rendered at request time from the live report, so a forwarded card cannot
 * outlive the data it describes by more than the cache.
 */

import { ImageResponse } from "next/og";

import { fetchReport } from "@/lib/api";

export const alt = "Neighbour Trust locality report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Matches the site's own palette rather than re-inventing one; a preview that
// does not look like the page it opens is its own small dishonesty.
const BRAND_DEEP = "#0e5a3f";
const BRAND = "#147a56";
const PAPER = "#fcfcfb";

function bandFor(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Fair";
  if (score >= 50) return "Mixed";
  return "Weak";
}

export default async function OpengraphImage({
  params,
}: {
  params: { slug: string };
}) {
  const report = await fetchReport(params.slug).catch(() => null);

  // No report is still a shareable link, so it still gets a card — one that
  // says so rather than rendering an empty frame or falling back to a generic
  // logo that implies there is something behind it.
  if (!report) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%", height: "100%", display: "flex",
            flexDirection: "column", justifyContent: "center",
            padding: 80, background: BRAND_DEEP, color: PAPER,
            fontSize: 44, fontWeight: 700,
          }}
        >
          <div style={{ display: "flex", fontSize: 26, opacity: 0.85 }}>Neighbour Trust</div>
          <div style={{ display: "flex", marginTop: 16 }}>Neighbourhood data with its sources attached</div>
        </div>
      ),
      size,
    );
  }

  const { name, city } = report.locality;
  const trust = report.trustScore;
  const counted = report.categories.filter((c) => c.counted).length;
  const findings = report.flags.slice(0, 2).map((f) => f.headline);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          padding: "64px 72px", background: BRAND_DEEP, color: PAPER,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26 }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: 12, background: BRAND,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700,
            }}
          >
            N
          </div>
          <div style={{ display: "flex", fontWeight: 700 }}>Neighbour Trust</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 24, marginTop: 44 }}>
          <div style={{ display: "flex", fontSize: 150, fontWeight: 800, lineHeight: 1 }}>
            {trust.score ?? "—"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", paddingBottom: 18 }}>
            <div style={{ display: "flex", fontSize: 26, opacity: 0.85 }}>
              {trust.score !== null
                ? `Trust Score / 100 · ${bandFor(trust.score)}`
                : "Not enough data to score yet"}
            </div>
            {/* The qualifier travels with the number. In a group chat nobody
              * scrolls to a footnote, so if it does not fit here it does not
              * exist. */}
            <div style={{ display: "flex", fontSize: 22, opacity: 0.6, marginTop: 4 }}>
              {trust.score !== null ? `from ${counted} of 5 categories` : "we say so rather than guess"}
            </div>
          </div>
        </div>

        {/* One string, not `{name}, {city}`. Satori refuses any element with
          * more than one child unless it declares display:flex, and JSX counts
          * three text nodes there — the error surfaces as a 500 on the image
          * route rather than as anything visible in the editor. */}
        <div style={{ display: "flex", fontSize: 42, fontWeight: 700, marginTop: 28 }}>
          {`${name}, ${city}`}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 26 }}>
          {findings.length > 0 ? (
            findings.map((line, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, fontSize: 25 }}>
                <div
                  style={{
                    width: 9, height: 9, borderRadius: 9, background: "#fab219",
                    marginTop: 11,
                  }}
                />
                <div style={{ display: "flex", opacity: 0.92 }}>{line}</div>
              </div>
            ))
          ) : (
            <div style={{ display: "flex", fontSize: 25, opacity: 0.8 }}>
              Nothing flagged here in the last year of local reporting.
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex", marginTop: "auto", paddingTop: 26, fontSize: 22,
            opacity: 0.55, borderTop: "1px solid rgba(252,252,251,0.25)",
          }}
        >
          {`neighbourtrust.com/${params.slug}`}
        </div>
      </div>
    ),
    size,
  );
}
