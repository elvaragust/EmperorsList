import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/data/db';
import { ensureFaction, listFactions, type FactionFile } from '@/data/dataPacks';
import { loadIndex, saveRoster } from '@/data/gameData';
import { decodePayload, payloadToRoster } from '@/data/shareLink';
import { matchFaction, parseListText, type ImportReport } from '@/engine/listText';
import { importListText } from '@/data/importList';
import type { SharePayload } from '@/engine/share';
import { Screen } from '@/ui/Screen';

/** Import a list from the official app's text export, or open a share link. */
export function ImportScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [text, setText] = useState('');
  const [factions, setFactions] = useState<FactionFile[]>([]);
  const [faction, setFaction] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<{ id: string; report: ImportReport } | null>(null);
  const [payload, setPayload] = useState<SharePayload | null>(null);

  useEffect(() => {
    listFactions().then(setFactions, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => {
    const m = location.hash.match(/l=([\w-]+)/);
    if (m) decodePayload(m[1]!).then(setPayload, () => setError('This share link could not be read.'));
  }, [location.hash]);

  const parsed = useMemo(() => (text.trim() ? parseListText(text) : undefined), [text]);
  useEffect(() => {
    if (!parsed || faction) return;
    const hit = matchFaction(parsed, factions);
    if (hit) setFaction(hit.path);
  }, [parsed, factions, faction]);

  const openLink = async () => {
    if (!payload) return;
    setError('');
    try {
      setBusy('Getting the faction data…');
      if (!(await db.dataFiles.where('catalogueId').equals(payload.c).first())) {
        if (!payload.f) throw new Error('This link does not say which faction file to download.');
        await ensureFaction(payload.f, setBusy);
      }
      const index = await loadIndex(payload.c);
      const roster = payloadToRoster(payload);
      const saved = await saveRoster(index, roster);
      navigate(`/roster/${saved.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const importText = async () => {
    if (!parsed || !faction) return;
    setError('');
    try {
      setBusy('Getting the faction data…');
      const f = factions.find((x) => x.path === faction)!;
      const { roster, report: rep } = await importListText(parsed, f, setBusy);
      const index = await loadIndex(roster.catalogueId);
      const saved = await saveRoster(index, roster);
      setReport({ id: saved.id, report: rep });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <Screen title="Import list" back>
      {error && <p className="issue-title">{error}</p>}
      {busy && <p className="muted">{busy}</p>}

      {payload && (
        <div className="card" style={{ padding: 14, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 18 }}>{payload.n}</div>
          <div className="muted small">
            {payload.fn} · {payload.u.length} units · {payload.p} pts
          </div>
          <div className="btn-row">
            <button className="btn btn-primary btn-block" onClick={openLink} disabled={Boolean(busy)}>
              Add this list
            </button>
          </div>
        </div>
      )}

      {report ? (
        <>
          <p>
            Imported with {report.report.matched.length} matched lines
            {report.report.unmatched.length ? ` and ${report.report.unmatched.length} that need a look` : ''}.
          </p>
          {report.report.unmatched.length > 0 && (
            <div className="card" style={{ padding: 14 }}>
              <div className="advice-title">Not matched — check these by hand</div>
              <ul className="small">
                {report.report.unmatched.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="btn-row">
            <button className="btn btn-primary btn-block" onClick={() => navigate(`/roster/${report.id}`, { replace: true })}>
              Open the list
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="section-label">Paste a list</div>
          <p className="small muted">Paste the text export from the official Warhammer app (or this app). Units, models, wargear, Warlord, Enhancements and detachments are matched by name.</p>
          <textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="My list (2000 points)…" aria-label="List text" />
          {parsed && (
            <>
              <label className="field">
                <span>Faction</span>
                <select className="input" value={faction} onChange={(e) => setFaction(e.target.value)}>
                  <option value="">Choose…</option>
                  {factions.map((f) => (
                    <option key={f.path} value={f.path}>
                      {f.group} · {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="small muted">
                Found: {parsed.title ?? 'untitled'} · {parsed.units.length} units
                {parsed.detachments.length ? ` · ${parsed.detachments.join(', ')}` : ''}
              </p>
              <button className="btn btn-primary btn-block" disabled={!faction || Boolean(busy)} onClick={importText}>
                Import
              </button>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
