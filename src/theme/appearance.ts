import { useSyncExternalStore } from 'react';

/** Personal look-and-feel settings, kept on this device. */
export interface Appearance {
  /** 'faction' = follow the open list; otherwise one theme everywhere ('' = the house gothic theme). */
  themeMode: 'faction' | 'fixed';
  fixedTheme: string;
  textSize: 'normal' | 'large' | 'xlarge';
  titleFont: 'gothic' | 'serif' | 'plain';
  labelStyle: 'dotted' | 'bold' | 'underline';
  width: 'phone' | 'wide';
}

const KEY = 'emperorslist.appearance';
const DEFAULTS: Appearance = { themeMode: 'faction', fixedTheme: '', textSize: 'normal', titleFont: 'gothic', labelStyle: 'dotted', width: 'phone' };

function load(): Appearance {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Appearance>) };
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

export function setAppearance(patch: Partial<Appearance>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* ignore */
  }
  applyAppearance();
  listeners.forEach((l) => l());
}

export const getAppearance = () => current;

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
}

/** Push settings onto <html> as data attributes the CSS reads. */
export function applyAppearance() {
  const root = document.documentElement;
  root.dataset.text = current.textSize;
  root.dataset.titleFont = current.titleFont;
  root.dataset.width = current.width;
  if (current.themeMode === 'fixed') {
    if (current.fixedTheme) root.dataset.theme = current.fixedTheme;
    else delete root.dataset.theme;
  } else {
    delete root.dataset.theme;
  }
}
