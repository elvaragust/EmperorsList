import { useState } from 'react';
import { isIOSBrowser } from '@/data/platform';
import { Icon } from './Icon';

const KEY = 'emperorslist.iosBannerHidden';
const AGAIN_AFTER = 7 * 24 * 3600 * 1000;

const hiddenRecently = () => {
  try {
    return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < AGAIN_AFTER;
  } catch {
    return false;
  }
};
const hide = () => {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
};

/**
 * In Safari on iPhone/iPad (not the installed app): install first, because
 * the Home Screen app has its own storage and Safari deletes site data after
 * 7 days without a visit. `compact` is a one-line bar for screens opened from
 * a shared link or QR code.
 */
export function IosInstallBanner({ compact }: { compact?: boolean }) {
  const [show, setShow] = useState(() => isIOSBrowser() && !hiddenRecently());
  if (!show) return null;
  const close = () => (hide(), setShow(false));
  if (compact)
    return (
      <div className="data-banner" role="note">
        <span style={{ flex: 1 }}>Opened in Safari: what you save here stays in Safari, not in the Home Screen app.</span>
        <button className="icon-btn" aria-label="Hide" onClick={close}>
          <Icon name="close" />
        </button>
      </div>
    );
  return (
    <div className="backup-nudge" role="note">
      <div style={{ fontWeight: 600 }}>Install first: Share → Add to Home Screen</div>
      <div className="small muted">
        Lists made in Safari don't move to the installed app — use a backup file to move them. Safari also deletes this site's data if you don't open it for 7 days.
      </div>
      <div className="btn-row" style={{ margin: '8px 0 0' }}>
        <button className="btn btn-sm btn-ghost" onClick={close}>
          Got it
        </button>
      </div>
    </div>
  );
}
