import { useMemo } from 'react';
import { datasheet, unitModels } from '@/engine/rules/models';
import { ROLES, unitRole } from '@/engine/rules/roles';
import type { RosterEngine } from '@/engine/rules/rosterEngine';
import type { Roster, RosterUnit } from '@/engine/types';
import { Collapse } from '@/ui/Collapse';
import { DatasheetView } from '@/ui/DatasheetView';
import { isLegends, LegendsTag, legendsName } from '@/ui/Legends';
import { RulesPanel } from '@/screens/play/panels';
import { combinedModels } from './combined';

/**
 * The army as you'd read it at the table: army and detachment rules, then each
 * unit (with the characters leading it) as a full datasheet, nothing to edit.
 */
export function PlayView({ engine, roster }: { engine: RosterEngine; roster: Roster }) {
  const groups = useMemo(() => {
    const byRole = new Map<string, RosterUnit[]>();
    for (const u of roster.units) {
      if (u.leaderOf && roster.units.some((b) => b.id === u.leaderOf)) continue;
      const r = unitRole(engine, u.id, u.primaryCategory);
      byRole.set(r, [...(byRole.get(r) ?? []), u]);
    }
    return ROLES.map((r) => [r, byRole.get(r) ?? []] as const).filter(([, list]) => list.length);
  }, [engine, roster]);
  const name = (u: RosterUnit) => u.nickname || legendsName(u.name);

  return (
    <div className="play-view">
      <Collapse title="Army & detachment rules">
        <RulesPanel engine={engine} />
      </Collapse>
      {groups.map(([role, units]) => (
        <div key={role}>
          <div className="section-label">{role}</div>
          {units.map((u) => {
            const leaders = roster.units.filter((x) => x.leaderOf === u.id);
            const all = [...leaders, u];
            const pts = all.reduce((s, x) => s + engine.unitPoints(x.id), 0);
            const tags = all.flatMap((x) => {
              const t: string[] = [];
              const who = all.length > 1 ? `${name(x)}: ` : '';
              if (engine.isWarlord(x.id)) t.push(`${who}Warlord`);
              const enh = engine.enhancementOf(x.id);
              if (enh) t.push(`${who}${engine.ev.name(enh)}`);
              return t;
            });
            return (
              <Collapse
                key={u.id}
                title={
                  <span style={{ textAlign: 'left' }}>
                    {leaders.length ? `${leaders.map(name).join(' + ')} + ` : ''}
                    {name(u)}
                    {all.some((x) => isLegends(x.name)) && <LegendsTag />}
                    {tags.length > 0 && <span className="muted small play-view-tags">{tags.join(' · ')}</span>}
                  </span>
                }
                right={<span className="muted small num">{pts}</span>}
              >
                <UnitSheet engine={engine} unit={u} leaders={leaders} />
              </Collapse>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function UnitSheet({ engine, unit, leaders }: { engine: RosterEngine; unit: RosterUnit; leaders: RosterUnit[] }) {
  const inst = engine.unitInst(unit.id);
  if (!inst) return null;
  const sheet = datasheet(engine, inst);
  const models = leaders.length ? combinedModels(engine, [unit, ...leaders]) : unitModels(engine, unit.id);
  const attached = leaders.flatMap((a) => {
    const i = engine.unitInst(a.id);
    return i ? [{ name: a.nickname || a.name, sheet: datasheet(engine, i) }] : [];
  });
  return <DatasheetView sheet={sheet} weapons={[...models.weapons.values()]} index={engine.index} attached={attached} />;
}
