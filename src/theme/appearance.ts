import { useSyncExternalStore } from 'react';

/** Personal look-and-feel settings, kept on this device. */
export interface Appearance {
  /** 'faction' = follow the open list; otherwise one theme everywhere ('' = the house gothic theme). */
  themeMode: 'faction' | 'fixed';
  fixedTheme: string;
  textSize: 'normal' | 'large' | 'xlarge';
  titleFont: 'gothic' | 'serif' | 'plain';
  labelStyle: 'dotted' | 'bold' | 'underline';
  /** 'auto' = adapt to the screen (sidebar and side-by-side panes on a PC); 'phone' = always the phone column. */
  layout: 'auto' | 'phone';
}

const KEY = 'emperorslist.appearance';
const DEFAULTS: Appearance = { themeMode: 'faction', fixedTheme: '', textSize: 'normal', titleFont: 'gothic', labelStyle: 'dotted', layout: 'auto' };

function load(): Appearance {
  try {
    // Older versions had a 'width' setting that defaulted to the phone column; it's ignored so everyone gets the adaptive layout.
    const { width: _old, ...saved } = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Appearance> & { width?: string };
    return { ...DEFAULTS, ...saved };
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
  root.dataset.layout = current.layout;
  if (current.themeMode === 'fixed') {
    if (current.fixedTheme) root.dataset.theme = current.fixedTheme;
    else delete root.dataset.theme;
  } else {
    delete root.dataset.theme;
  }
}
