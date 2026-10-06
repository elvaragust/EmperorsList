import { useEffect, useState } from 'react';
import { db } from './db';
import { showToast } from '@/ui/Toast';

/**
 * Everything (lists, games, pins, collection, downloaded data) lives in this
 * browser's IndexedDB for this site. Browsers may clear "best-effort" site
 * storage when the phone is low on space, so ask for it to be kept.
 */
export async function keepStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export interface StorageInfo {
  persisted?: boolean;
  usage?: number;
  quota?: number;
  lists: number;
  games: number;
  pins: number;
}

export function useStorageInfo(): StorageInfo | undefined {
  const [info, setInfo] = useState<StorageInfo>();
  useEffect(() => {
    let live = true;
    (async () => {
      const [persisted, est, lists, games, pins] = await Promise.all([
        navigator.storage?.persisted?.().catch(() => undefined),
        navigator.storage?.estimate?.().catch(() => undefined),
        db.rosters.count(),
        db.games.count(),
        db.pins.count(),
      ]);
      if (live) setInfo({ persisted, usage: est?.usage, quota: est?.quota, lists, games, pins });
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return info;
}

/** Explain a storage failure in plain words. */
export function storageMessage(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  const inner = (e as { inner?: { name?: string } })?.inner?.name ?? '';
  if (/Quota/i.test(name + inner)) return 'The phone is out of storage space for this app — free some space, then try again.';
  if (/DatabaseClosed|InvalidState|Blocked|VersionError/i.test(name + inner)) return 'The app data is busy (another tab may be open on an older version). Close other EmperorsList tabs and reload.';
  if (/Abort|Timeout/i.test(name + inner)) return 'Saving was interrupted — try again.';
  return e instanceof Error ? e.message : String(e);
}

/** Surface database problems instead of failing silently. */
export function watchStorageErrors(): () => void {
  const onRejection = (ev: PromiseRejectionEvent) => {
    const r = ev.reason as { name?: string } | undefined;
    if (r && typeof r === 'object' && /Dexie|IDB|Quota|Database|Transaction|Abort|Constraint|DataClone|InvalidState/i.test(r.name ?? '')) {
      showToast(`Couldn't save: ${storageMessage(r)}`);
    }
  };
  window.addEventListener('unhandledrejection', onRejection);
  db.on('blocked', () => showToast('Close other EmperorsList tabs — they are holding an older version of your data open.'));
  db.on('versionchange', () => {
    // A newer version of the app opened the data in another tab: step aside so it can upgrade.
    db.close();
    showToast('The app was updated in another tab — reloading…');
    setTimeout(() => location.reload(), 1500);
    return false;
  });
  return () => window.removeEventListener('unhandledrejection', onRejection);
}
