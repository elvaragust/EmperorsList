import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ensureFaction, listFactions, type FactionFile } from '@/data/dataPacks';
import { rootsFor, saveRoster, useIndex } from '@/data/gameData';
import { configChoices, enhancementsByDetachment, setBattleSize, setDetachments, setDisposition } from '@/engine/rules/config';
import { DetachmentCard } from '@/ui/DetachmentCard';
import { RosterEngine } from '@/engine/rules/rosterEngine';
import type { BattleSize, Roster } from '@/engine/types';
import { db } from '@/data/db';
import { useFactionTheme } from '@/theme/themes';
import { Screen } from '@/ui/Screen';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
const SIZES: { size: BattleSize; label: string; points: number; note: string }[] = [
  { size: 'incursion', label: 'Incursion', points: 1000, note: '2 Detachment Points · 2 Enhancements · 2 of each datasheet' },
  { size: 'strikeForce', label: 'Strike Force', points: 2000, note: '3 Detachment Points · 4 Enhancements · 3 of each datasheet' },
  { size: 'onslaught', label: 'Onslaught', points: 3000, note: 'Larger games' },
  { size: 'custom', label: 'Custom points', points: 0, note: 'Set your own limit' },
];

function blankRoster(catalogueId: string, factionName: string, gameSystemId: string): Roster {
  const now = Date.now();
  return {
    id: uid(),
    name: '',
    gameSystemId,
    catalogueId,
    factionName,
    battleSize: 'strikeForce',
    pointsLimit: 2000,
    config: [],
    detachmentIds: [],
    units: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** New list wizard: faction → battle size → detachments → force disposition and name. */
export function NewListScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [factions, setFactions] = useState<FactionFile[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [filter, setFilter] = useState('');
  const [roster, setRoster] = useState<Roster>();
  const [custom, setCustom] = useState(1500);
  const { index, error: indexError } = useIndex(roster?.catalogueId);
  useFactionTheme(roster?.factionName);

  useEffect(() => {
    listFactions().then(setFactions, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const engine = useMemo(() => (index && roster ? new RosterEngine(index, roster, rootsFor(index, roster.catalogueId)) : undefined), [index, roster]);
  const choices = useMemo(() => (engine ? configChoices(engine) : undefined), [engine]);

  const pickFaction = async (f: FactionFile) => {
    setError('');
    try {
      setBusy(`Getting ${f.name}…`);
      const rec = await ensureFaction(f.path, setBusy);
      const gst = await db.dataFiles.filter((x) => Boolean(x.gameSystem)).first();
      const name = f.name;
      setRoster({ ...blankRoster(rec.catalogueId ?? '', name, gst?.catalogueId ?? ''), dataCommit: rec.commit, name: `${name} list` });
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const pickSize = (size: BattleSize) => {
    if (!engine || !roster) return;
    setRoster(setBattleSize(engine, roster, size, size === 'custom' ? custom : undefined));
  };

  const toggleDetachment = (key: string) => {
    if (!engine || !roster) return;
    const has = roster.detachmentIds.includes(key);
    setRoster(setDetachments(engine, roster, has ? roster.detachmentIds.filter((k) => k !== key) : [...roster.detachmentIds, key]));
  };

  const finish = async () => {
    if (!roster) return;
    const saved = await saveRoster(index, { ...roster, name: roster.name.trim() || `${roster.factionName} list` });
    navigate(`/roster/${saved.id}`, { replace: true });
  };

  const groups = useMemo(() => {
    const m = new Map<string, FactionFile[]>();
    factions
      ?.filter((f) => !filter || `${f.group} ${f.name}`.toLowerCase().includes(filter.toLowerCase()))
      .forEach((f) => m.set(f.group, [...(m.get(f.group) ?? []), f]));
    return [...m.entries()];
  }, [factions, filter]);

  const dp = engine?.detachmentPoints();
  const visibleDetachments = useMemo(() => choices?.detachments.filter((d) => !d.hidden) ?? [], [choices]);
  const enhByDet = useMemo(() => (index ? enhancementsByDetachment(index, visibleDetachments) : new Map()), [index, visibleDetachments]);
  const titles = ['Faction', 'Battle size', 'Detachments', 'Disposition'];

  return (
    <Screen title={`New list · ${titles[step]}`} back>
      <div className="wizard-steps" aria-hidden="true">
        {titles.map((t, i) => (
          <span key={t} className={i <= step ? 'done' : undefined} />
        ))}
      </div>
      {error && <p className="issue-title">{error}</p>}
      {indexError && step > 0 && <p className="issue-title">{indexError}</p>}
      {busy && <p className="muted">{busy}</p>}

      {step === 0 && (
        <>
          <input className="input" placeholder="Search factions" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search factions" />
          {!factions && !error && <p className="muted">Loading the faction list…</p>}
          {groups.map(([group, list]) => (
            <div key={group}>
              <div className="section-label">{group}</div>
              <div className="card">
                {list.map((f) => (
                  <button key={f.path} className="choice" disabled={Boolean(busy)} onClick={() => pickFaction(f)}>
                    <span style={{ flex: 1 }}>{f.name}</span>
                    <span className="muted small">{f.downloaded ? '' : 'Loading…'}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {step === 1 && roster && (
        <>
          <div className="card">
            {SIZES.map((s) => (
              <button key={s.size} className="choice" role="radio" aria-checked={roster.battleSize === s.size && roster.config.length > 0} onClick={() => pickSize(s.size)} disabled={!engine}>
                <span className="mark" />
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {s.label}
                    {s.points ? ` · ${s.points.toLocaleString('en')} pts` : ''}
                  </div>
                  <div className="muted small">{s.note}</div>
                </span>
              </button>
            ))}
          </div>
          {roster.battleSize === 'custom' && (
            <label className="field">
              <span>Points limit</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                value={custom}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  setCustom(v);
                  if (engine) setRoster(setBattleSize(engine, roster, 'custom', v));
                }}
              />
            </label>
          )}
          <div className="sticky-bar">
            {step > 0 && (
              <button className="btn" onClick={() => setStep(step - 1)} aria-label="Back a step">
                ‹
              </button>
            )}
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!roster.config.length} onClick={() => setStep(2)}>
              Next
            </button>
          </div>
        </>
      )}

      {step === 2 && roster && choices && (
        <>
          <p className="muted small">
            Detachment Points: <span className="num">{dp?.used ?? 0}</span> / {dp?.max ?? '–'}. Pick one or more detachments.
          </p>
          <div className="card" style={{ overflow: 'hidden' }}>
            {visibleDetachments.map((d) => (
              <DetachmentCard key={d.key} d={d} enhancements={enhByDet.get(d.key) ?? []} index={index} selected={roster.detachmentIds.includes(d.key)} onToggle={() => toggleDetachment(d.key)} />
            ))}
          </div>
          <p className="small muted">Tap ▸ to read a detachment's rules, enhancements and stratagems before picking it.</p>
          {dp?.max !== undefined && dp.used > dp.max && <p className="issue-title">Over the Detachment Point limit by {dp.used - dp.max}.</p>}
          <div className="sticky-bar">
            {step > 0 && (
              <button className="btn" onClick={() => setStep(step - 1)} aria-label="Back a step">
                ‹
              </button>
            )}
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!roster.detachmentIds.length} onClick={() => setStep(3)}>
              Next
            </button>
          </div>
        </>
      )}

      {step === 3 && roster && choices && engine && (
        <>
          <p className="muted small">The Force Disposition decides which missions you play. Detachments tagged with it are listed beside each.</p>
          <div className="card">
            {choices.dispositions
              .filter((d) => !d.hidden)
              .map((d) => {
                const tagged = choices.detachments.filter((x) => roster.detachmentIds.includes(x.key) && x.dispositions.includes(d.name));
                return (
                  <button key={d.key} className="choice" role="radio" aria-checked={roster.forceDisposition === d.name} onClick={() => setRoster(setDisposition(engine, roster, d.key))}>
                    <span className="mark" />
                    <span style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{d.name}</div>
                      {tagged.length > 0 && <div className="muted small">{tagged.map((t) => t.name).join(', ')}</div>}
                    </span>
                  </button>
                );
              })}
          </div>
          <label className="field">
            <span>List name</span>
            <input className="input" value={roster.name} onChange={(e) => setRoster({ ...roster, name: e.target.value })} />
          </label>
          <div className="sticky-bar">
            {step > 0 && (
              <button className="btn" onClick={() => setStep(step - 1)} aria-label="Back a step">
                ‹
              </button>
            )}
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={finish}>
              Create list
            </button>
          </div>
        </>
      )}
    </Screen>
  );
}
