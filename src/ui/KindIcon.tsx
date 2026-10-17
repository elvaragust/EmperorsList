import { ABILITY_KIND_LABEL, type AbilityKind } from '@/engine/rules/abilityKind';

/** Small line icons hinting what an ability does (tap/hover shows the words). */
const PATHS: Record<AbilityKind, string> = {
  // crossed blades
  offence: 'M4 4l9 9M4 4v3M4 4h3M20 4l-9 9M20 4v3M20 4h-3M7 17l-3 3M17 17l3 3M9 15l-2 2M15 15l2 2',
  // target with a minus
  debuff: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h8',
  // shield
  defence: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z',
  // double chevron
  movement: 'M5 6l6 6-6 6M12 6l6 6-6 6',
  // arrow down onto the table
  deployment: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  // ripple from a point
  support: 'M12 12h.01M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8',
  // flag
  objective: 'M6 21V4M6 4h11l-2 4 2 4H6',
  // hexagon token
  resource: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM9 12h6',
  other: 'M12 8v.01M12 11v5',
};

export function KindIcon({ kind }: { kind: AbilityKind }) {
  const label = ABILITY_KIND_LABEL[kind];
  return (
    <span className="kind-icon" title={label} aria-label={label} role="img">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={PATHS[kind]} />
      </svg>
    </span>
  );
}
