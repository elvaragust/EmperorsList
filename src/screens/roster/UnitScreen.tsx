import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '@/data/db';
import { saveRoster, useRosterEngine } from '@/data/gameData';
import { datasheet, unitModels } from '@/engine/rules/models';
import type { RawProfile } from '@/engine/bsdata/raw';
import type { Roster, RosterUnit } from '@/engine/types';
import { useFactionTheme } from '@/theme/themes';
import { AbilityList, DatasheetView } from '@/ui/DatasheetView';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { Composition } from '@/ui/Composition';
import { WargearEditor } from './WargearEditor';
import { combinedModels, leaderBuffTag } from './combined';

type Tab = 'models' | 'wargear' | 'datasheet';

export function UnitScreen() {
  const { id = '', unitId = '' } = useParams();
  const navigate = useNavigate();
  const roster = useLiveQuery(() => db.rosters.get(id), [id]);
  const { engine, index } = useRosterEngine(roster);
  useFactionTheme(roster?.factionName);
  const [tab, setTab] = useState<Tab>('models');
  const [menu, setMenu] = useState(false);
  const [leadPicker, setLeadPicker] = useState(false);

  const unit = roster?.units.find((u) => u.id === unitId);
  const leading = unit?.leaderOf ? roster?.units.find((u) => u.id === unit.leaderOf) : undefined;
  const attached = useMemo(() => roster?.units.filter((u) => u.leaderOf === unitId) ?? [], [roster, unitId]);
  const combined = useMemo(() => (engine && unit ? combinedModels(engine, [unit, ...attached]) : undefined), [engine, unit, attached]);
  const sheet = useMemo(() => {
    const inst = engine?.unitInst(unitId);
    return engine && inst ? datasheet(engine, inst) : undefined;
  }, [engine, unitId]);
  const ownModels = useMemo(() => (engine ? unitModels(engine, unitId) : undefined), [engine, unitId]);

  if (!roster || !unit) return <Screen title="Unit" back>{roster && !unit ? <p className="muted">This unit was removed.</p> : null}</Screen>;

  const save = (fn: (r: Roster) => Roster) => saveRoster(index, fn(roster));
  const saveUnit = (u: RosterUnit) => save((r) => ({ ...r, units: r.units.map((x) => (x.id === u.id ? u : x)) }));
  const pts = engine?.unitPoints(unit.id) ?? unit.points;
  const together = attached.reduce((s, a) => s + (engine?.unitPoints(a.id) ?? a.points), pts);
  const targets = engine?.attachTargets(unit.id) ?? [];
  const unitIssues = engine?.issues().filter((i) => i.unitId === unit.id) ?? [];

  const leaderAbilities: { from: string; abilities: RawProfile[] }[] = [];
  if (engine) {
    for (const a of attached) {
      const inst = engine.unitInst(a.id);
      if (!inst) continue;
      const ds = datasheet(engine, inst);
      leaderAbilities.push({ from: a.nickname || a.name, abilities: ds.abilities.filter((x) => x.name !== 'Leader') });
    }
  }

  return (
    <Screen
      title={unit.nickname || unit.name}
      back
      actions={
        <button className="icon-btn" aria-label="Unit menu" onClick={() => setMenu(true)}>
          ⋯
        </button>
      }
    >
      <div className="muted small">
        <span className="num">{pts} pts</span>
        {attached.length > 0 && <> · {together} pts with attached characters</>}
        {engine?.isWarlord(unit.id) && <span className="tag"> · WARLORD</span>}
      </div>
      {unitIssues.map((i, k) => (
        <div key={k} className="small" style={{ marginTop: 6 }}>
          <span className="issue-title">{i.title}</span> — {i.why}
        </div>
      ))}

      {leading && (
        <Link to={`/roster/${roster.id}/unit/${leading.id}`} className="card row" style={{ marginTop: 10 }}>
          <span style={{ flex: 1 }}>
            Leading <strong>{leading.nickname || leading.name}</strong>
            <div className="muted small">Open the combined unit</div>
          </span>
          <span className="tag">VIEW</span>
        </Link>
      )}
      {engine?.canLead(unit.id) && !leading && (
        <button className="btn btn-block" style={{ marginTop: 10 }} onClick={() => setLeadPicker(true)}>
          Attach to a unit…
        </button>
      )}

      <div className="seg" role="tablist">
        {(['models', 'wargear', 'datasheet'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : undefined} onClick={() => setTab(t)} role="tab" aria-selected={tab === t}>
            {t === 'models' ? (attached.length ? 'Combined' : 'Unit') : t === 'wargear' ? 'Wargear' : 'Datasheet'}
          </button>
        ))}
      </div>

      {tab === 'models' && combined && (
        <>
          {attached.length > 0 && (
            <p className="muted small">
              {unit.name} led by {attached.map((a) => a.nickname || a.name).join(' and ')}. The shots-per-weapon grid and model removal are in Play.
            </p>
          )}
          <Composition models={combined} />
          {leaderAbilities.length > 0 && (
            <>
              <div className="section-label">Abilities from attached characters</div>
              {leaderAbilities.map((l) => (
                <div key={l.from}>
                  <div className="small muted" style={{ marginTop: 8 }}>
                    {l.from}
                  </div>
                  <AbilityList abilities={l.abilities} index={index} highlight={leaderBuffTag} />
                </div>
              ))}
              {sheet && (
                <>
                  <div className="section-label">{unit.name} abilities</div>
                  <AbilityList abilities={sheet.abilities} index={index} />
                </>
              )}
            </>
          )}
          {attached.length > 0 && (
            <div className="btn-row">
              {attached.map((a) => (
                <button key={a.id} className="btn btn-sm" onClick={() => save((r) => ({ ...r, units: r.units.map((x) => (x.id === a.id ? { ...x, leaderOf: undefined } : x)) }))}>
                  Detach {a.nickname || a.name}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'wargear' && engine && <WargearEditor engine={engine} unit={unit} onChange={saveUnit} />}

      {tab === 'datasheet' && sheet && ownModels && <DatasheetView sheet={sheet} weapons={[...ownModels.weapons.values()]} index={index} />}

      <Sheet open={leadPicker} onClose={() => setLeadPicker(false)} title="Attach to">
        {targets.length === 0 && <p className="muted">No unit in this list can take this character. Add one of the units its Leader ability lists.</p>}
        {targets.map((t) => {
          const body = roster.units.find((u) => u.id === t)!;
          const already = roster.units.filter((u) => u.leaderOf === t).map((u) => u.name);
          return (
            <button
              key={t}
              className="menu-item"
              onClick={() => {
                setLeadPicker(false);
                save((r) => ({ ...r, units: r.units.map((x) => (x.id === unit.id ? { ...x, leaderOf: t } : x)) }));
              }}
            >
              <span style={{ flex: 1 }}>
                {body.nickname || body.name}
                {already.length > 0 && <div className="muted small">Already led by {already.join(', ')}</div>}
              </span>
            </button>
          );
        })}
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)} title={unit.name}>
        <label className="field">
          <span>Nickname</span>
          <input className="input" defaultValue={unit.nickname ?? ''} placeholder={unit.name} onBlur={(e) => saveUnit({ ...unit, nickname: e.target.value.trim() || undefined })} />
        </label>
        <button
          className="menu-item"
          onClick={() => {
            const copy: RosterUnit = { ...structuredClone(unit), id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), leaderOf: undefined };
            save((r) => ({ ...r, units: [...r.units, copy] }));
            setMenu(false);
          }}
        >
          Duplicate unit
        </button>
        {unit.leaderOf && (
          <button className="menu-item" onClick={() => (saveUnit({ ...unit, leaderOf: undefined }), setMenu(false))}>
            Detach from {leading?.name}
          </button>
        )}
        <button
          className="menu-item btn-danger"
          onClick={() => {
            save((r) => ({ ...r, units: r.units.filter((x) => x.id !== unit.id).map((x) => (x.leaderOf === unit.id ? { ...x, leaderOf: undefined } : x)) }));
            navigate(-1);
          }}
        >
          Remove unit from list
        </button>
      </Sheet>
    </Screen>
  );
}
