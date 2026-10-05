import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/data/db';
import { ensureFaction, listFactions, type FactionFile } from '@/data/dataPacks';
import { loadIndex, rootsFor, saveRoster } from '@/data/gameData';
import { uid } from '@/data/rosters';
import { decodePayload, payloadToRoster } from '@/data/shareLink';
import { importUnit, normName, parseListText, type ImportReport } from '@/engine/listText';
import { configChoices, setBattleSize, setDetachments, setDisposition } from '@/engine/rules/config';
import { RosterEngine } from '@/engine/rules/rosterEngine';
import type { SharePayload } from '@/engine/share';
import type { Roster, RosterUnit } from '@/engine/types';
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
    if (!parsed?.faction || faction) return;
    const want = normName(parsed.faction);
    const hit = factions.find((f) => normName(f.name) === want) ?? factions.find((f) => want.includes(normName(f.name)) || normName(f.name).includes(want));
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
      const rec = await ensureFaction(faction, setBusy);
      const catalogueId = rec.catalogueId ?? '';
      const index = await loadIndex(catalogueId);
      const roots = rootsFor(index, catalogueId);
      const f = factions.find((x) => x.path === faction);
      const now = Date.now();
      let roster: Roster = {
        id: uid(),
        name: parsed.title || `${f?.name ?? 'Imported'} list`,
        gameSystemId: '',
        catalogueId,
        factionName: f?.name ?? parsed.faction ?? '',
        dataCommit: rec.commit,
        battleSize: parsed.battleSize ?? 'strikeForce',
        pointsLimit: 2000,
        config: [],
        detachmentIds: [],
        units: [],
        createdAt: now,
        updatedAt: now,
      };
      const eng = () => new RosterEngine(index, roster, roots);
      roster = setBattleSize(eng(), roster, roster.battleSize);
      const choices = configChoices(eng());
      const dets = parsed.detachments.map((d) => choices.detachments.find((x) => normName(x.name) === normName(d))).filter(Boolean).map((d) => d!.key);
      if (dets.length) roster = setDetachments(eng(), roster, dets);
      const disp = choices.dispositions.find((d) => normName(d.name) === normName(parsed.disposition ?? ''));
      if (disp) roster = setDisposition(eng(), roster, disp.key);

      const rep: ImportReport = { matched: [], unmatched: [] };
      parsed.detachments.forEach((d) => (choices.detachments.some((x) => normName(x.name) === normName(d)) ? rep.matched.push(`Detachment: ${d}`) : rep.unmatched.push(`Header line: ${d}`)));
      const units: RosterUnit[] = [];
      const attach: { unit: RosterUnit; to: string }[] = [];
      for (const pu of parsed.units) {
        setBusy(`Matching ${pu.name}…`);
        const u = importUnit((us) => new RosterEngine(index, { ...roster, units: us }, roots), units, pu, rep);
        if (!u) continue;
        units.push(u);
        const a = pu.lines.find((l) => l.kind === 'attached');
        if (a) attach.push({ unit: u, to: a.name });
      }
      for (const { unit, to } of attach) {
        const body = units.find((x) => x !== unit && normName(x.name) === normName(to));
        if (body) unit.leaderOf = body.id;
      }
      roster = { ...roster, units };
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
