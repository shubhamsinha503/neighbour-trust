/**
 * Pastel landmark/skyline illustration for the Popular-cities cards — a verbatim
 * port of the mobile app's CityBadge (apps/mobile/components/ui/CityBadge) so the
 * two products read as one. Five variants cycle by index. Purely decorative.
 */
export function CityBadge({ variant = 0, height = 74 }: { variant?: number; height?: number }) {
  const v = ((variant % 5) + 5) % 5;
  return (
    <svg
      width="100%"
      height={height}
      viewBox="0 0 120 74"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <rect x="0" y="0" width="120" height="74" fill="#FFF0F6" />
      <rect x="0" y="60" width="120" height="14" fill="#EAF3EC" />
      <circle cx="14" cy="60" r="9" fill="#8ED0AE" />
      <circle cx="106" cy="60" r="9" fill="#8ED0AE" />

      {v === 0 && (
        <g>
          <path d="M46 60 V34 a14 14 0 0 1 28 0 V60" fill="#F4C89B" />
          <path d="M55 60 V40 a5 5 0 0 1 10 0 V60" fill="#FFF0F6" />
          <rect x="44" y="30" width="32" height="6" rx="2" fill="#E8B27E" />
        </g>
      )}
      {v === 1 && (
        <g>
          <path d="M54 60 L57 22 h6 l3 38 Z" fill="#E8A87C" />
          <rect x="55" y="34" width="10" height="2.5" fill="#FFF0F6" />
          <rect x="55" y="44" width="10" height="2.5" fill="#FFF0F6" />
          <circle cx="60" cy="20" r="3" fill="#D98E5E" />
        </g>
      )}
      {v === 2 && (
        <g>
          <rect x="40" y="30" width="16" height="30" rx="2" fill="#9BC7F2" />
          <rect x="58" y="20" width="14" height="40" rx="2" fill="#7FB0EA" />
          <rect x="74" y="34" width="14" height="26" rx="2" fill="#B7D6F7" />
          <g fill="#ffffff" opacity={0.75}>
            <rect x="44" y="36" width="3" height="3" /><rect x="50" y="36" width="3" height="3" />
            <rect x="62" y="26" width="3" height="3" /><rect x="66" y="26" width="3" height="3" />
            <rect x="78" y="40" width="3" height="3" />
          </g>
        </g>
      )}
      {v === 3 && (
        <g>
          <rect x="46" y="38" width="28" height="22" rx="2" fill="#C9B8F5" />
          <path d="M48 38 a12 12 0 0 1 24 0 Z" fill="#B7A6EE" />
          <circle cx="60" cy="22" r="3.5" fill="#A78BF0" />
          <rect x="56" y="48" width="8" height="12" rx="3" fill="#FFF0F6" />
        </g>
      )}
      {v === 4 && (
        <g>
          <rect x="42" y="34" width="12" height="26" rx="2" fill="#FFB3CC" />
          <rect x="56" y="26" width="10" height="34" rx="2" fill="#FF9DBE" />
          <rect x="68" y="40" width="12" height="20" rx="2" fill="#FFD6A5" />
        </g>
      )}
    </svg>
  );
}
