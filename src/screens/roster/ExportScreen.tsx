import { useLiveQuery } from 'dexie-react-hooks';
import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '@/data/db';
import { useRosterEngine } from '@/data/gameData';
import { downloadText } from '@/data/backup';
import { encodeRoster, shareUrl } from '@/data/shareLink';
import { exportText } from '@/engine/listText';
import { useFactionTheme } from '@/theme/themes';
import { Screen } from '@/ui/Screen';

const QR_LIMIT = 2300;

export function ExportScreen() {
  const { id = '' } = useParams();
  const roster = useLiveQuery(() => db.rosters.get(id), [id]);
  const { engine } = useRosterEngine(roster);
  useFactionTheme(roster?.factionName);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState('');
  const text = useMemo(() => (engine && roster ? exportText(engine, roster) : ''), [engine, roster]);

  useEffect(() => {
    if (roster) encodeRoster(roster).then(setCode);
  }, [roster]);
  const url = code ? shareUrl(code) : '';
  const qr = useMemo(() => {
    if (!url || url.length > QR_LIMIT) return '';
    const q = qrcode(0, 'L');
    q.addData(url);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
  }, [url]);

  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
    } catch {
      setCopied('Copy failed — select the text and copy it manually');
    }
  };

  if (!roster) return <Screen title="Export" back>{null}</Screen>;
  return (
    <Screen title="Export & share" back>
      <div className="section-label">Text (same layout as the official app)</div>
      <textarea className="input" readOnly value={text} style={{ minHeight: 220, fontSize: 13 }} aria-label="List as text" />
      <div className="btn-row">
        <button className="btn btn-sm" onClick={() => copy('Text copied', text)} disabled={!text}>
          Copy text
        </button>
        <button className="btn btn-sm" onClick={() => downloadText(`${roster.name}.txt`, text, 'text/plain')} disabled={!text}>
          Download .txt
        </button>
      </div>

      <div className="section-label">Share link</div>
      <p className="small muted">Opens this list in EmperorsList on another device. It holds only ids and counts; the other device downloads the game data itself.</p>
      <input className="input" readOnly value={url} aria-label="Share link" />
      <div className="btn-row">
        <button className="btn btn-sm" onClick={() => copy('Link copied', url)} disabled={!url}>
          Copy link
        </button>
        {'share' in navigator && (
          <button className="btn btn-sm" onClick={() => navigator.share({ title: roster.name, text: roster.name, url }).catch(() => undefined)} disabled={!url}>
            Share…
          </button>
        )}
      </div>
      {copied && <p className="small">{copied}</p>}

      <div className="section-label">QR code</div>
      {qr ? (
        <div style={{ background: '#fff', padding: 12, borderRadius: 12, maxWidth: 320 }} dangerouslySetInnerHTML={{ __html: qr }} aria-label="QR code of the share link" />
      ) : (
        <p className="small muted">{url ? 'This list is too large for one QR code. Use the link instead.' : 'Preparing…'}</p>
      )}
    </Screen>
  );
}
