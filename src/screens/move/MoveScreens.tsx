import qrcode from 'qrcode-generator';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NEW_HOME } from '@/data/newHome';
import { parseMoveCode, receive, resultText, sendTo, TransferError } from '@/data/transfer';
import { Screen } from '@/ui/Screen';

const message = (e: unknown) => (e instanceof TransferError ? e.message : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`);

/** Old address: send everything on this device to the new address. */
export function MoveOutScreen() {
  const [home, setHome] = useState(NEW_HOME);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ link: string; code: string; expiresAt: number }>();
  const [copied, setCopied] = useState(false);

  const go = async () => {
    setError('');
    setSent(undefined);
    try {
      const url = new URL(/^https?:\/\//.test(home.trim()) ? home.trim() : `https://${home.trim()}`);
      setSent(await sendTo(url.origin + url.pathname, setStep));
    } catch (e) {
      setError(message(e));
    } finally {
      setStep('');
    }
  };
  const qr = useMemo(() => {
    if (!sent) return '';
    const q = qrcode(0, 'L');
    q.addData(sent.link);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 3, scalable: true });
  }, [sent]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sent!.link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Screen title="Move to the new address" back="/settings">
      <div className="card">
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, padding: 14 }}>
          <div className="small">
            Browsers keep each web address’s data apart, so the app at a new address starts empty. This sends your lists, games, collection, pins, table layouts <b>and the downloaded army data</b> there in one go.
          </div>
          <div className="small muted">It’s encrypted on this phone; the key is only in the link you get, never on the server. The parcel is deleted after 48 hours. Nothing here is changed or removed.</div>
          {!NEW_HOME && (
            <label className="small">
              New address
              <input className="input" value={home} onChange={(e) => setHome(e.target.value)} placeholder="https://…" inputMode="url" autoComplete="off" />
            </label>
          )}
          {!sent && (
            <button className="btn" onClick={go} disabled={Boolean(step) || !home.trim()}>
              {step || 'Send my data'}
            </button>
          )}
          {error && (
            <div className="small issue-title" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>

      {sent && (
        <>
          <div className="section-label">Now open it at the new address</div>
          <div className="card">
            <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, padding: 14 }}>
              <a className="btn" href={sent.link} target="_blank" rel="noopener">
                Open the new address
              </a>
              <div className="small">
                <b>Installed on your home screen?</b> The installed app keeps its own data. Install the new address on the home screen first, open it, then go to <i>Settings → Bring data from the old address</i> and paste the link — or scan this code with the phone it’s going to:
              </div>
              <div className="qr-box" role="img" aria-label="QR code of the move link" dangerouslySetInnerHTML={{ __html: qr }} />
              <button className="btn btn-sm" onClick={copy}>
                {copied ? 'Link copied' : 'Copy link'}
              </button>
              <div className="small muted">Works until {new Date(sent.expiresAt).toLocaleString()}. Anyone with the link can read the parcel — share it only with yourself.</div>
            </div>
          </div>
        </>
      )}
    </Screen>
  );
}

/** New address: bring in a parcel sent from the old address. Opened from the move link (/move#code) or from Settings. */
export function MoveInScreen() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const [code, setCode] = useState(() => decodeURIComponent(hash.slice(1)));
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  // Keep the key out of the address bar and history once it's read.
  useEffect(() => {
    if (hash) window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [hash]);

  const go = async () => {
    setError('');
    try {
      const r = await receive(code, setStep);
      setDone(resultText(r));
    } catch (e) {
      setError(message(e));
    } finally {
      setStep('');
    }
  };
  const valid = Boolean(parseMoveCode(code));

  return (
    <Screen title="Bring data from the old address" back="/settings">
      <div className="card">
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, padding: 14 }}>
          {!done && (
            <>
              <div className="small">Adds the lists, games, collection and army data sent from the old address. Anything already here is kept; a list or game is only replaced by a newer copy of itself.</div>
              <label className="small">
                Link or code
                <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the link from the old address" autoComplete="off" spellCheck={false} />
              </label>
              <button className="btn" onClick={go} disabled={!valid || Boolean(step)}>
                {step || 'Bring my data here'}
              </button>
            </>
          )}
          {error && (
            <div className="small issue-title" role="alert">
              {error}
            </div>
          )}
          {done && (
            <>
              <div role="status">{done}</div>
              <button className="btn" onClick={() => navigate('/lists', { replace: true })}>
                Go to my lists
              </button>
            </>
          )}
        </div>
      </div>
    </Screen>
  );
}
