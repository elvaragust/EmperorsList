/**
 * Rules the downloaded data still carries but that no longer exist in the
 * current edition. Names only (no rules text); they are hidden everywhere.
 * If the data drops one, its entry here simply stops matching anything.
 */
const RETIRED_RULES = new Set(['templar vows', 'oath of moment']);

export const isRetiredRule = (name: string | undefined) => RETIRED_RULES.has((name ?? '').trim().toLowerCase());
