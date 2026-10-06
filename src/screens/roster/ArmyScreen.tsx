import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '@/data/db';
import { saveRoster, useRosterEngine } from '@/data/gameData';
import { configChoices, enhancementsByDetachment, setBattleSize, setDetachments, setDisposition, setToggle } from '@/engine/rules/config';
import { DetachmentCard } from '@/ui/DetachmentCard';
import type { BattleSize, Roster } from '@/engine/types';
import { useFactionTheme } from '@/theme/themes';
import { Screen } from '@/ui/Screen';

const SIZES: { size: BattleSize; label: string }[] = [
  { size: 'incursion', label: 'Incursion · 1,000 pts' },
  { size: 'strikeForce', label: 'Strike Force · 2,000 pts' },
  { size: 'onslaught', label: 'Onslaught · 3,000 pts' },
  { size: 'custom', label: 'Custom points' },
];

/** Battle size, detachments, Force Disposition and other army switches for an existing list. */
export function ArmyScreen() {
  const { id = '' } = useParams();
  const roster = useLiveQuery(() => db.rosters.get(id), [id]);
  const { engine, index } = useRosterEngine(roster);
  useFactionTheme(roster?.factionName);
  const choices = useMemo(() => (engine ? configChoices(engine) : undefined), [engine]);
  const shown = useMemo(() => choices?.detachments.filter((d) => !d.hidden || roster?.detachmentIds.includes(d.key)) ?? [], [choices, roster]);
  const enhByDet = useMemo(() => (engine ? enhancementsByDetachment(engine.index, shown) : new Map()), [engine, shown]);
  if (!roster) return <Screen title="Army" back>{null}</Screen>;
  if (!engine || !choices) return <Screen title="Army" back><p className="muted">Loading…</p></Screen>;
  const save = (r: Roster) => saveRoster(index, r);
  const dp = engine.detachmentPoints();

  return (
    <Screen title="Army" back>
      <div className="section-label">Battle size</div>
      <div className="card">
        {SIZES.map((s) => (
          <button key={s.size} className="choice" role="radio" aria-checked={roster.battleSize === s.size} onClick={() => save(setBattleSize(engine, roster, s.size))}>
            <span className="mark" />
            <span style={{ flex: 1 }}>{s.label}</span>
          </button>
        ))}
      </div>
      {roster.battleSize === 'custom' && (
        <label className="field">
          <span>Points limit</span>
          <input className="input" type="number" inputMode="numeric" defaultValue={roster.pointsLimit} onBlur={(e) => save(setBattleSize(engine, roster, 'custom', Number(e.target.value) || roster.pointsLimit))} />
        </label>
      )}

      <div className="section-label">
        Detachments · {dp.used}/{dp.max ?? '–'} DP
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {shown.map((d) => {
          const on = roster.detachmentIds.includes(d.key);
          return (
            <DetachmentCard
              key={d.key}
              d={d}
              enhancements={enhByDet.get(d.key) ?? []}
              index={index}
              selected={on}
              note={d.hidden ? 'not available to this army' : undefined}
              onToggle={() => save(setDetachments(engine, roster, on ? roster.detachmentIds.filter((k) => k !== d.key) : [...roster.detachmentIds, d.key]))}
            />
          );
        })}
      </div>

      <div className="section-label">Force Disposition</div>
      <div className="card">
        {choices.dispositions
          .filter((d) => !d.hidden)
          .map((d) => (
            <button key={d.key} className="choice" role="radio" aria-checked={roster.forceDisposition === d.name} onClick={() => save(setDisposition(engine, roster, d.key))}>
              <span className="mark" />
              <span style={{ flex: 1 }}>{d.name}</span>
            </button>
          ))}
      </div>

      {choices.toggles.filter((t) => !t.hidden).length > 0 && (
        <>
          <div className="section-label">Options from the data</div>
          <div className="card">
            {choices.toggles
              .filter((t) => !t.hidden)
              .map((t) => (
                <button key={t.key} className="choice" role="checkbox" aria-checked={t.on} onClick={() => save(setToggle(roster, t.rootKey, !t.on))}>
                  <span className="mark square" />
                  <span style={{ flex: 1 }}>{t.name}</span>
                </button>
              ))}
          </div>
        </>
      )}
      <p className="muted small" style={{ marginTop: 16 }}>
        Data version: {roster.dataCommit ? roster.dataCommit.slice(0, 7) : 'unknown'}
      </p>
    </Screen>
  );
}
