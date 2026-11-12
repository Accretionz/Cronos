/**
 * The app's line icons (24×24, drawn with the current text color). Used by the navigation;
 * a module without one here falls back to its text `icon`.
 */
const PATHS: Record<string, string> = {
  today: "M12 4V2.5M12 21.5V20M4 12H2.5M21.5 12H20M6.3 6.3 5.2 5.2M18.8 18.8l-1.1-1.1M6.3 17.7l-1.1 1.1M18.8 5.2l-1.1 1.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  tasks: "M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-11ZM8.5 12.2l2.4 2.3 4.6-5",
  dailies: "M19.5 9A8 8 0 0 0 5 7.5M4.5 15A8 8 0 0 0 19 16.5M19.5 4v5h-5M4.5 20v-5h5",
  calendar: "M4 8a2.5 2.5 0 0 1 2.5-2.5h11A2.5 2.5 0 0 1 20 8v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 18V8ZM4 10.5h16M8.5 3.5v4M15.5 3.5v4M8 14.5h2M14 14.5h2",
  budget: "M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v9.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-9ZM4 8.5 15.5 4.2a1 1 0 0 1 1.4.9V6M20 11h-3.5a2 2 0 0 0 0 4H20",
  jobs: "M4 9.5A2.5 2.5 0 0 1 6.5 7h11A2.5 2.5 0 0 1 20 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-8ZM9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M4 13h16",
  game: "M12 3.5l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8L12 3.5Z",
  summon: "M8.2 15.8a5.4 5.4 0 0 1 0-7.6l3.5-3.5a5.4 5.4 0 0 1 7.6 7.6l-3.5 3.5a5.4 5.4 0 0 1-7.6 0ZM6.5 13.5l4 4M10 8l6 6M17 20.5v-3M18.5 19h-3",
  field: "M12 20v-7M12 13c0-4 2.7-6.5 7-6.5 0 4-2.7 6.5-7 6.5ZM12 15.5c0-3.3-2.2-5.5-6-5.5 0 3.3 2.2 5.5 6 5.5ZM5 20h14",
  more: "M5 5h4v4H5V5ZM15 5h4v4h-4V5ZM5 15h4v4H5v-4ZM15 15h4v4h-4v-4Z",
  settings: "M5 7h9M18 7h1M5 17h1M10 17h9M14 5v4M6 15v4M5 12h4M13 12h6M9 10v4",
};

export function hasIcon(id: string): boolean {
  return id in PATHS;
}

export function Icon({ id, size = 20 }: { id: string; size?: number }) {
  const d = PATHS[id];
  if (!d) return null;
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** The Cronos mark: an orbit with the sun on it (the same arc the Today header draws). */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 28 28" aria-hidden>
      <circle cx="14" cy="14" r="10" fill="none" stroke="currentColor" strokeWidth="2.2" opacity="0.35" />
      <path d="M4 14a10 10 0 0 1 16.4-7.7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="20.4" cy="6.3" r="3.2" fill="var(--gold)" />
    </svg>
  );
}
