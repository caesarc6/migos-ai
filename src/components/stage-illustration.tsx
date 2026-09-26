export function StageIllustration() {
  return (
    <svg
      viewBox="0 0 960 540"
      role="img"
      aria-label="Two performers rapping and dancing in front of one microphone"
      className="aspect-video h-auto w-full bg-[#120e0c]"
    >
      <rect width="960" height="540" fill="#120e0c" />
      <rect width="64" height="540" fill="#1b1512" />
      <rect x="896" width="64" height="540" fill="#1b1512" />
      <path d="M18 40v460M36 28v484M50 48v430" stroke="#3a2c24" strokeWidth="6" strokeLinecap="round" />
      <path d="M910 40v460M928 28v484M942 48v430" stroke="#3a2c24" strokeWidth="6" strokeLinecap="round" />
      <defs>
        <linearGradient id="migo-spot" x1="480" y1="0" x2="480" y2="500" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f0a202" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f0a202" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points="480,0 280,500 680,500" fill="url(#migo-spot)" />
      <path d="M140 430 Q480 392 820 430 L820 468 Q480 512 140 468 Z" fill="#2a211c" />
      <ellipse cx="480" cy="468" rx="300" ry="22" fill="#0a0706" opacity="0.55" />

      <g className="migo-bob" fill="none" strokeLinecap="round">
        <path d="M214 158c8-30 62-34 74-4-10-12-54-12-74 4z" fill="#1a120f" stroke="none" />
        <circle cx="248" cy="186" r="28" fill="#f0d2b4" stroke="none" />
        <path d="M208 214c20-18 60-18 80 0l16 86c2 18-10 30-24 30h-64c-16 0-28-12-24-30z" fill="#c23b22" stroke="none" />
        <path d="M240 220h18l-6 78h-8z" fill="#f6efe4" stroke="none" />
        <path d="M286 228c34 8 58 4 78 22" stroke="#f0d2b4" strokeWidth="12" />
        <circle cx="368" cy="252" r="9" fill="#f0d2b4" stroke="none" />
        <path d="M210 232c-28 16-34 40-16 54" stroke="#f0d2b4" strokeWidth="12" />
        <path d="M228 326c-10 40-26 78-42 96" stroke="#241812" strokeWidth="14" />
        <path d="M272 326c12 38 32 68 52 88" stroke="#241812" strokeWidth="14" />
        <path d="M168 418h42" stroke="#f3ead7" strokeWidth="8" />
        <path d="M308 410h44" stroke="#f3ead7" strokeWidth="8" />
        <path d="M392 214c12-10 12-24 0-34" stroke="#f0a202" strokeWidth="3" />
        <path d="M408 206c16-14 16-32 0-46" stroke="#f0a202" strokeWidth="3" />
      </g>

      <g className="migo-bob-late" fill="none" strokeLinecap="round">
        <circle cx="742" cy="156" r="14" fill="#1a120f" stroke="none" />
        <circle cx="712" cy="178" r="28" fill="#f0d2b4" stroke="none" />
        <path d="M678 206c22-12 56-8 72 14l6 74-78 18-18-78z" fill="#1f6f6a" stroke="none" />
        <path d="M690 214c-8-46 10-86 34-108" stroke="#f0d2b4" strokeWidth="12" />
        <path d="M748 226c34 10 56 32 60 52" stroke="#f0d2b4" strokeWidth="12" />
        <path d="M700 300c8 44 4 84 0 112" stroke="#241812" strokeWidth="14" />
        <path d="M726 308c32-12 70-42 98-46" stroke="#241812" strokeWidth="14" />
        <path d="M808 254h32" stroke="#f3ead7" strokeWidth="8" />
        <path d="M682 408h40" stroke="#f3ead7" strokeWidth="8" />
        <path d="M840 236c22 8 30 8 44-4" stroke="#f0a202" strokeWidth="3" />
        <path d="M848 252c18 6 26 4 36-8" stroke="#f0a202" strokeWidth="3" />
      </g>

      <g>
        <rect x="474" y="248" width="12" height="168" rx="6" fill="#d9c7a4" />
        <rect x="444" y="404" width="72" height="12" rx="4" fill="#8a704f" />
        <ellipse cx="480" cy="224" rx="28" ry="36" fill="#161311" stroke="#e7d7c1" strokeWidth="5" />
        <ellipse cx="480" cy="224" rx="14" ry="20" fill="#efe4d4" />
        <path d="M468 216h24M468 224h24M468 232h24" stroke="#161311" strokeWidth="2" />
      </g>

      <text x="248" y="512" textAnchor="middle" fill="#f3ead7" fontSize="20" fontFamily="ui-sans-serif, system-ui, sans-serif">
        Performer 1
      </text>
      <text x="712" y="512" textAnchor="middle" fill="#f3ead7" fontSize="20" fontFamily="ui-sans-serif, system-ui, sans-serif">
        Performer 2
      </text>
      <text
        x="480"
        y="42"
        textAnchor="middle"
        fill="#e2b15a"
        fontSize="14"
        letterSpacing="4"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        RAP + DANCE
      </text>
    </svg>
  );
}
