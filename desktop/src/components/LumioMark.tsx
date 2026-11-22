/** The Lumio app icon (star + comet trail on a night tile), as used in the window chrome. Same art as scripts/icons.ts. */
export function LumioMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="lm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a1546" />
          <stop offset="0.55" stopColor="#140f36" />
          <stop offset="1" stopColor="#07080c" />
        </linearGradient>
        <radialGradient id="lm-glow" cx="42" cy="22" r="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7c5cff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#7c5cff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lm-trail" gradientUnits="userSpaceOnUse" x1="10" y1="55" x2="42" y2="22">
          <stop offset="0" stopColor="#7c5cff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#7c5cff" />
          <stop offset="0.8" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#lm-bg)" />
      <rect width="64" height="64" rx="15" fill="url(#lm-glow)" />
      <path d="M9.4 54.5C14 42 21 30 41.8 22.3L42.6 26.6C25 31 17 42 9.4 54.5Z" fill="url(#lm-trail)" />
      <path d="M41.8 8.6Q43.4 20.7 55.5 22.3Q43.4 23.9 41.8 36Q40.2 23.9 28.1 22.3Q40.2 20.7 41.8 8.6Z" fill="#fff" />
      <path d="M19.9 14.4Q20.4 17.7 23.8 18.2Q20.4 18.7 19.9 22Q19.4 18.7 16 18.2Q19.4 17.7 19.9 14.4Z" fill="#fff" opacity="0.9" />
    </svg>
  );
}
