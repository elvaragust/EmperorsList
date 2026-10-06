import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { db } from '@/data/db';
import { abilityInPhase, type Phase } from '@/engine/game';
import type { UnitSummary } from '@/engine/live';
import { datasheet, unitModels } from '@/engine/rules/models';
import type { RosterEngine } from '@/engine/rules/rosterEngine';
import { stratagemFits, stratagemsFor, type ImportedRule } from '@/engine/wahapedia';
import { RuleLabel } from '@/ui/RuleLabel';
import { useRulePopup } from '@/ui/RulePopup';

/** Stratagems (from the import) and your abilities that apply in this phase and turn. */
export function PhasePanel({ engine, phase, myTurn, onSpend }: { engine?: RosterEngine; phase: Phase; myTurn: boolean; onSpend: (s: ImportedRule, cost: number) => void }) {
  const popup = useRulePopup();
  const imported = useLiveQuery(() => db.imported.toArray(), []);
  const index = engine?.index;
  const strats = useMemo(() => {
    if (!imported || !engine) return [];
    const hints = [engine.roster.factionName, ...[...engine.index.catalogues.values()].map((c) => c.name.split(' - ').pop() ?? '')];
    return stratagemsFor(imported, engine.roster.detachmentNames ?? [], hints).filter((s) => stratagemFits(s, phase, myTurn ? 'me' : 'them'));
  }, [imported, engine, phase, myTurn]);
  const abilities = useMemo(() => {
    if (!engine) return [];
    const out: { unit: string; name: string; text: string }[] = [];
    for (const u of engine.roster.units) {
      const inst = engine.unitInst(u.id);
      if (!inst) continue;
      for (const a of datasheet(engine, inst).abilities) {
        const text = a.characteristics?.map((c) => c.$text ?? '').join('\n') ?? '';
        if (abilityInPhase(text, phase)) out.push({ unit: u.nickname || u.name, name: a.name, text });
      }
    }
    return out;
  }, [engine, phase]);
  return (
    <>
      <div className="section-label">Your stratagems</div>
      {imported && imported.length === 0 && <p className="small muted">Get stratagems in Settings → Extra rules to see them here.</p>}
      <div className="card">
        {strats.map((s) => (
          <div key={s.id} className="row">
            <button
              className="kw"
              style={{ flex: 1, textAlign: 'left', textDecoration: 'none' }}
              onClick={() => popup.openDef({ name: s.name, text: s.text, kind: 'stratagem', source: `${s.cp ?? '?'} CP · ${s.detachment ?? s.faction} · Wahapedia` }, index)}
            >
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div className="muted small">{[s.detachment ?? 'Core', s.turn].filter(Boolean).join(' · ')}</div>
            </button>
            <button className="btn btn-sm" onClick={() => onSpend(s, Number(s.cp ?? 0) || 0)}>
              {s.cp ?? '?'} CP
            </button>
          </div>
        ))}
        {imported && imported.length > 0 && strats.length === 0 && <div className="row muted small">None for this phase.</div>}
      </div>
      <div className="section-label">Your abilities this phase</div>
      <div className="card">
        {abilities.map((a, i) => (
          <button key={i} className="choice" onClick={() => popup.openDef({ name: a.name, text: a.text, kind: 'ability', source: a.unit }, index)}>
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{a.name}</div>
              <div className="muted small">{a.unit}</div>
            </span>
            <RuleLabel kind="ability" />
          </button>
        ))}
        {abilities.length === 0 && <div className="row muted small">Nothing mentions this phase.</div>}
      </div>
      {imported && imported.length > 0 && <p className="credit">Stratagems powered by Wahapedia.</p>}
    </>
  );
}

export interface UnitLeft {
  id: string;
  name: string;
  total: number;
  dead: number;
}

/** Bodyguard units (with attached characters folded in) and how many models are left. */
export function unitsLeft(engine: RosterEngine, casualties: Record<string, string[]>): UnitLeft[] {
  return engine.roster.units
    .filter((u) => !u.leaderOf || !engine.roster.units.some((b) => b.id === u.leaderOf))
    .map((u) => {
      const group = [u, ...engine.roster.units.filter((x) => x.leaderOf === u.id)];
      let total = 0;
      let dead = 0;
      for (const m of group) {
        const n = unitModels(engine, m.id).models.length;
        total += n;
        dead += Math.min(n, casualties[m.id]?.length ?? 0);
      }
      return { id: u.id, name: group.map((x) => x.nickname || x.name).join(' + '), total, dead };
    });
}

export const toSummaries = (list: UnitLeft[]): UnitSummary[] => list.map((u) => ({ name: u.name, alive: u.total - u.dead, total: u.total }));

export function UnitsPanel({ gameId, units }: { gameId: string; units: UnitLeft[] }) {
  return (
    <div className="card">
      {units.map((u) => (
        <Link key={u.id} className="unit-row" to={`/play/${gameId}/unit/${u.id}`}>
          <span style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, textDecoration: u.dead >= u.total ? 'line-through' : undefined }}>{u.name}</div>
            <div className="muted small">
              {u.total - u.dead}/{u.total} models
            </div>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function SummaryList({ units }: { units: UnitSummary[] }) {
  return (
    <div className="card">
      {units.map((u, i) => (
        <div key={i} className="row">
          <span style={{ flex: 1, textDecoration: u.alive <= 0 ? 'line-through' : undefined }}>{u.name}</span>
          <span className="muted small">
            {u.alive}/{u.total}
          </span>
        </div>
      ))}
      {units.length === 0 && <div className="row muted small">No casualty info shared yet.</div>}
    </div>
  );
}
