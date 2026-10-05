import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '@/data/db';
import { useRosterEngine } from '@/data/gameData';
import { datasheet, unitModels } from '@/engine/rules/models';
import { Screen } from '@/ui/Screen';
import { StatLine, WeaponTable } from '@/ui/DatasheetView';

const plain = (s: string) => s.replace(/\^\^|\*\*/g, '');

/** Printable datacards: one card per unit with stats, weapons, abilities and wargear. */
export function PrintScreen() {
  const { id = '' } = useParams();
  const roster = useLiveQuery(() => db.rosters.get(id), [id]);
  const { engine } = useRosterEngine(roster);
  const cards = useMemo(() => {
    if (!engine || !roster) return [];
    return roster.units.map((u) => {
      const inst = engine.unitInst(u.id);
      const sheet = inst ? datasheet(engine, inst) : undefined;
      const models = unitModels(engine, u.id);
      const counts = new Map<string, number>();
      models.models.forEach((m) => {
        const l = models.loadouts.find((x) => x.key === m.loadoutKey);
        if (l) counts.set(l.name, (counts.get(l.name) ?? 0) + 1);
      });
      const leader = u.leaderOf ? roster.units.find((x) => x.id === u.leaderOf) : undefined;
      const enh = engine.enhancementOf(u.id);
      return { u, sheet, models, counts, leader, enh: enh ? engine.ev.name(enh) : undefined, pts: engine.unitPoints(u.id), warlord: engine.isWarlord(u.id) };
    });
  }, [engine, roster]);
  if (!roster) return <Screen title="Print" back>{null}</Screen>;
  return (
    <Screen title="Datacards" back>
      <div className="no-print btn-row">
        <button className="btn btn-primary btn-block" onClick={() => window.print()}>
          Print or save as PDF
        </button>
      </div>
      <h2 style={{ fontFamily: 'var(--font-body)', margin: '8px 0' }}>
        {roster.name} · {engine?.totalPoints() ?? ''} pts
      </h2>
      <p className="small">
        {roster.factionName} · {roster.detachmentNames?.join(' + ')} {roster.forceDisposition ? `· ${roster.forceDisposition}` : ''}
      </p>
      {cards.map(({ u, sheet, models, counts, leader, enh, pts, warlord }) => (
        <div key={u.id} className="print-card card" style={{ padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 18 }}>{u.nickname || u.name}</strong>
            {warlord && <span className="tag">WARLORD</span>}
            <span className="spacer" />
            <span className="num">{pts} pts</span>
          </div>
          <div className="small muted">
            {[...counts.entries()].map(([n, c]) => `${c}× ${n}`).join(', ')}
            {enh ? ` · Enhancement: ${enh}` : ''}
            {leader ? ` · Attached to ${leader.name}` : ''}
          </div>
          {sheet?.stats.map((p) => <StatLine key={p.id + p.name} profile={p} />)}
          <WeaponTable weapons={[...models.weapons.values()].filter((w) => !w.melee)} melee={false} />
          <WeaponTable weapons={[...models.weapons.values()].filter((w) => w.melee)} melee />
          {sheet && sheet.abilities.length > 0 && (
            <div className="small" style={{ marginTop: 6 }}>
              {sheet.abilities.map((a) => (
                <p key={a.name} style={{ margin: '4px 0' }}>
                  <strong>{a.name}:</strong> {plain(a.characteristics?.map((c) => c.$text ?? '').join(' ') ?? '')}
                </p>
              ))}
            </div>
          )}
          {sheet && <div className="small muted">{[...sheet.rules.map((r) => r.name), ...sheet.keywords].join(', ')}</div>}
        </div>
      ))}
    </Screen>
  );
}
