/** The mark: an arrow dropping into a tray, on the accent gradient. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="tlk-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff7a38" />
          <stop offset="1" stopColor="#ff4a1a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#tlk-mark)" />
      <path
        d="M16 7.5v11m0 0-4.5-4.5M16 18.5l4.5-4.5M9 20.5v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"
        fill="none"
        stroke="#170701"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
