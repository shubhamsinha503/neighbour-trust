/**
 * Decorative cover photography for locality cards and headers.
 *
 * These are representative cityscape / residential stock photos (Unsplash), not
 * images of the specific place — chosen deterministically per locality so a card
 * always looks the same. They are purely visual; every score and fact in the app
 * still comes from the real data pipeline.
 */
const PHOTO_IDS = [
  "photo-1615683212302-30c0a8c5a02f",
  "photo-1570168007204-dfb528c6958f",
  "photo-1587474260584-136574528ed5",
  "photo-1524492412937-b28074a5d7da",
  "photo-1560448204-e02f11c3d0e2",
  "photo-1512453979798-5ea266f8880c",
  "photo-1449824913935-59a10b8d2000",
  "photo-1477959858617-67f85cf4f1df",
  "photo-1486406146926-c627a92ad1ab",
  "photo-1518005020951-eccb494ad742",
];

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/** A stable Unsplash cover URL for a locality, sized to `width` px wide. */
export function coverImage(seed: string, width = 600): string {
  const id = PHOTO_IDS[hash(seed) % PHOTO_IDS.length];
  return `https://images.unsplash.com/${id}?w=${width}&q=70&auto=format&fit=crop`;
}
