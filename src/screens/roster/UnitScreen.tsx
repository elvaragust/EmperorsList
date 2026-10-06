import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '@/data/db';
import { saveRoster, useRosterEngine } from '@/data/gameData';
import { autoFill, setForWholeUnit, setOptionCount } from '@/engine/rules/edit';
import { datasheet, unitModels } from '@/engine/rules/models';
import { modelTypes, setModelsWithOption, type ModelGroup, type ModelOption, type ModelType } from '@/engine/rules/modelTypes';
import { RosterEngine, WARLORD_CATEGORY, type OptionView } from '@/engine/rules/rosterEngine';
import type { RawProfile } from '@/engine/bsdata/raw';
import type { Roster, RosterUnit } from '@/engine/types';
import { useFactionTheme } from '@/theme/themes';
import { Collapse } from '@/ui/Collapse';
import { AbilityList, DatasheetView } from '@/ui/DatasheetView';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { Stepper } from '@/ui/Stepper';
import { showToast } from '@/ui/Toast';
import { leaderBuffTag } from './combined';
import { OptionList } from './WargearEditor';

/**
 * One page per unit, laid out like the official app: the unit and its points,
 * enhancements, then a band per kind of model with its count and its wargear
 * options (how many of those models carry each one).
 */
export function UnitScreen() {
  const { id = '', unitId = '' } = useParams();
  const navigate = useNavigate();
  const roster = useLiveQuery(() => db.rosters.get(id), [id]);
  const { engine, index } = useRosterEngine(roster);
  useFactionTheme(roster?.factionName);
  const [menu, setMenu] = useState(false);
  const [leadPicker, setLeadPicker] = useState(false);
  const [showSheet, setShowSheet] = useState(false);

  const unit = roster?.units.find((u) => u.id === unitId);
  const leading = unit?.leaderOf ? roster?.units.find((u) => u.id === unit.leaderOf) : undefined;
  const attached = useMemo(() => roster?.units.filter((u) => u.leaderOf === unitId) ?? [], [roster, unitId]);
  const sheet = useMemo(() => {
    const inst = engine?.unitInst(unitId);
    return engine && inst ? datasheet(engine, inst) : undefined;
  }, [engine, unitId]);
  const ownModels = useMemo(() => (engine ? unitModels(engine, unitId) : undefined), [engine, unitId]);
  const types = useMemo(() => (engine ? modelTypes(engine, unitId) : []), [engine, unitId]);

  if (!roster || !unit) return <Screen title="Unit" back>{roster && !unit ? <p className="muted">This unit was removed.</p> : null}</Screen>;

  const save = (fn: (r: Roster) => Roster) => saveRoster(index, fn(roster));
  const saveUnit = (u: RosterUnit) => save((r) => ({ ...r, units: r.units.map((x) => (x.id === u.id ? u : x)) }));
  const engineFor = (u: RosterUnit) => new RosterEngine(engine!.index, { ...roster, units: roster.units.map((x) => (x.id === u.id ? u : x)) }, [...engine!.roots.values()]);
  const commit = (u: RosterUnit) => saveUnit(autoFill(engineFor, u));

  const pts = engine?.unitPoints(unit.id) ?? unit.points;
  const together = attached.reduce((s, a) => s + (engine?.unitPoints(a.id) ?? a.points), pts);
  const targets = engine?.attachTargets(unit.id) ?? [];
  const unitIssues = engine?.issues().filter((i) => i.unitId === unit.id) ?? [];
  const total = engine?.totalPoints() ?? 0;
  const limit = engine?.pointsLimit() ?? roster.pointsLimit;
  const listErrors = engine?.issues().filter((i) => i.severity === 'error').length ?? 0;
  const modelCount = ownModels?.models.length ?? 0;

  // Unit-level choices: Warlord, Enhancement, and anything that isn't a model.
  const root = engine?.unitInst(unit.id);
  const views = engine && root ? engine.optionsUnder(root) : [];
  const flat = (v: OptionView): OptionView[] => v.children.flatMap((c) => (c.kind === 'entry' ? [c] : c.hidden && !c.selected ? [] : flat(c)));
  const warlord = views.find((v) => v.kind === 'entry' && (v.node.categoryIds.includes(WARLORD_CATEGORY) || v.name === 'Warlord'));
  const enhGroup = views.find((v) => v.kind === 'group' && /enhancement/i.test(v.name));
  const enhancements = enhGroup ? flat(enhGroup).filter((e) => !e.hidden || e.selected > 0) : [];
  const chosenEnh = enhancements.find((e) => e.selected > 0);
  const isModelThing = (v: OptionView): boolean => (v.kind === 'entry' ? v.node.type === 'model' : v.children.length > 0 && v.children.every(isModelThing));
  const singleModel = root?.node?.type === 'model';
  const handled = new Set(types.flatMap((t) => [...t.groups.map((g) => g.key), ...t.extras.map((e) => e.key)]));
  const others = singleModel
    ? []
    : views.filter((v) => v !== warlord && v !== enhGroup && !isModelThing(v) && !handled.has(v.node.key) && !(v.hidden && !v.selected));

  const pickEnhancement = (key: string | null) => {
    if (!engine) return;
    let u = unit;
    for (const e of enhancements) if (e.selected > 0 && e.node.key !== key) u = setOptionCount(engineFor(u), u, [], e.node.key, 0);
    if (key) u = setOptionCount(engineFor(u), u, [], key, 1);
    commit(u);
  };

  const leaderAbilities: { from: string; abilities: RawProfile[] }[] = [];
  if (engine) {
    for (const a of attached) {
      const inst = engine.unitInst(a.id);
      if (!inst) continue;
      leaderAbilities.push({ from: a.nickname || a.name, abilities: datasheet(engine, inst).abilities.filter((x) => x.name !== 'Leader') });
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
      <div className="unit-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>
            {unit.name}
            {engine?.isWarlord(unit.id) && <span className="tag"> · WARLORD</span>}
          </div>
          <div className="muted small">
            {modelCount} {modelCount === 1 ? 'model' : 'models'}
            {attached.length > 0 && ` · ${together} pts with ${attached.map((a) => a.nickname || a.name).join(' & ')}`}
          </div>
        </div>
        <span className="pts-chip">{pts} pts</span>
        <button className="icon-btn" aria-label="Datasheet" title="Datasheet" onClick={() => setShowSheet(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <path d="M14 3v6h6M8 13h8M8 17h8" />
          </svg>
        </button>
      </div>

      {unitIssues.map((i, k) => (
        <div key={k} className="small" style={{ marginTop: 8 }}>
          <span className="issue-title">{i.title}</span> — {i.why}
        </div>
      ))}

      {leading && (
        <Link to={`/roster/${roster.id}/unit/${leading.id}`} className="card row" style={{ marginTop: 10 }}>
          <span style={{ flex: 1 }}>
            Leading <strong>{leading.nickname || leading.name}</strong>
          </span>
          <span className="tag">VIEW</span>
        </Link>
      )}
      {engine?.canLead(unit.id) && !leading && (
        <button className="btn btn-block" style={{ marginTop: 10 }} onClick={() => setLeadPicker(true)}>
          Attach to a unit…
        </button>
      )}

      {(warlord || enhancements.length > 0) && (
        <>
          {warlord && !(warlord.hidden && !warlord.selected) && (
            <div className="card" style={{ marginTop: 10 }}>
              <button className="choice" role="switch" aria-checked={warlord.selected > 0} onClick={() => engine && commit(setOptionCount(engine, unit, [], warlord.node.key, warlord.selected ? 0 : 1))}>
                <span style={{ flex: 1, fontWeight: 600 }}>Warlord</span>
                <span className={`switch ${warlord.selected ? 'on' : ''}`} aria-hidden="true" />
              </button>
            </div>
          )}
          {enhancements.length > 0 && (
            <Collapse title="Unit enhancements" defaultOpen={Boolean(chosenEnh)} right={chosenEnh ? <span className="small" style={{ textTransform: 'none', letterSpacing: 0 }}>{chosenEnh.name}</span> : undefined}>
              <div className="gear-box">
                <button className="gear-row" role="radio" aria-checked={!chosenEnh} onClick={() => pickEnhancement(null)}>
                  <span style={{ flex: 1 }}>None</span>
                  <span className={`check ${!chosenEnh ? 'on' : ''}`}>{!chosenEnh ? '✓' : ''}</span>
                </button>
                {enhancements.map((e) => (
                  <button key={e.node.key} className="gear-row" role="radio" aria-checked={e.selected > 0} onClick={() => pickEnhancement(e.selected > 0 ? null : e.node.key)}>
                    <span style={{ flex: 1 }}>
                      {e.name}
                      {e.hidden && <div className="small issue-title">Not allowed with the current choices</div>}
                    </span>
                    {e.points ? <span className="num muted small">+{e.points} pts</span> : null}
                    <span className={`check ${e.selected ? 'on' : ''}`}>{e.selected ? '✓' : ''}</span>
                  </button>
                ))}
              </div>
            </Collapse>
          )}
        </>
      )}

      {engine &&
        types.map((t) => (
          <ModelSection
            key={t.key || 'self'}
            t={t}
            single={singleModel}
            onCount={(n) => commit(setOptionCount(engine, unit, [], t.key, n))}
            onCarry={(optionKey, n, group) => {
              let next = setModelsWithOption(engineFor, unit, t.key, optionKey, n, group);
              const after = modelTypes(engineFor(next), unit.id).find((x) => x.key === t.key);
              const carried = [...(after?.groups.flatMap((g) => g.options) ?? []), ...(after?.extras ?? [])].find((o) => o.key === optionKey)?.carried;
              if (carried !== undefined && carried !== Math.min(n, t.count)) {
                // The rules tie this choice to the rest of the unit (e.g. the whole squad carries the same weapon).
                const name = [...(group?.options ?? []), ...t.extras].find((o) => o.key === optionKey)?.name;
                if (name && n > 0) {
                  next = setForWholeUnit(engineFor, unit, name);
                  showToast('Changed for the whole unit — they must carry the same weapon');
                }
              }
              saveUnit(next);
            }}
          />
        ))}

      {engine && others.length > 0 && (
        <Collapse title="Other options" defaultOpen={others.some((o) => o.selected > 0)}>
          <div className="card">
            <OptionList engine={engine} engineFor={engineFor} unit={unit} path={[]} views={others} onChange={commit} />
          </div>
        </Collapse>
      )}

      {leaderAbilities.length > 0 && (
        <Collapse title="Attached characters" defaultOpen>
          {leaderAbilities.map((l) => (
            <div key={l.from}>
              <div className="small muted" style={{ marginTop: 6 }}>
                {l.from}
              </div>
              <AbilityList abilities={l.abilities} index={index} highlight={leaderBuffTag} />
            </div>
          ))}
          <div className="btn-row">
            {attached.map((a) => (
              <button key={a.id} className="btn btn-sm" onClick={() => save((r) => ({ ...r, units: r.units.map((x) => (x.id === a.id ? { ...x, leaderOf: undefined } : x)) }))}>
                Detach {a.nickname || a.name}
              </button>
            ))}
          </div>
        </Collapse>
      )}

      <div className="sticky-bar">
        <span className={`pts-chip`} style={{ background: total > limit || listErrors ? 'var(--danger)' : undefined, color: total > limit || listErrors ? '#1a0000' : undefined }}>
          {total > limit || listErrors ? '!' : '✓'} {total.toLocaleString('en')}/{limit.toLocaleString('en')}
        </span>
        <span className="muted small" style={{ flex: 1 }}>
          {listErrors ? `${listErrors} ${listErrors === 1 ? 'issue' : 'issues'} in the list` : 'List is valid'}
        </span>
        <Link className="btn btn-sm" to={`/roster/${roster.id}`}>
          Done
        </Link>
      </div>

      <Sheet open={showSheet} onClose={() => setShowSheet(false)} title={unit.name}>
        {sheet && ownModels && <DatasheetView sheet={sheet} weapons={[...ownModels.weapons.values()]} index={index} />}
      </Sheet>

      <Sheet open={leadPicker} onClose={() => setLeadPicker(false)} title="Attach to">
        {targets.length === 0 && <p className="muted">No unit in this list can take this character. Add one of the units its Leader ability lists.</p>}
        {targets.map((tid) => {
          const body = roster.units.find((u) => u.id === tid)!;
          const already = roster.units.filter((u) => u.leaderOf === tid).map((u) => u.name);
          return (
            <button
              key={tid}
              className="menu-item"
              onClick={() => {
                setLeadPicker(false);
                save((r) => ({ ...r, units: r.units.map((x) => (x.id === unit.id ? { ...x, leaderOf: tid } : x)) }));
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
            showToast(`Added another ${unit.name}`);
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

/** A band per kind of model, then its wargear: what every model carries and each choice with how many carry it. */
function ModelSection({
  t,
  single,
  onCount,
  onCarry,
}: {
  t: ModelType;
  single: boolean;
  onCount: (n: number) => void;
  onCarry: (optionKey: string, n: number, group?: ModelGroup) => void;
}) {
  const variable = !single && !(t.min === t.max && t.max >= 0);
  const hasChoices = t.groups.some((g) => g.options.length > 1 || g.optional) || t.extras.length > 0;
  const empty = t.count === 0;
  return (
    <>
      <div className={`model-band ${empty ? 'empty' : ''}`}>
        <span style={{ flex: 1 }}>
          {t.name}
          {t.group && !single && (
            <span className="sub">
              {t.group.name} · {t.group.selected} of {t.group.max > 0 ? (t.group.min === t.group.max ? t.group.max : `${t.group.min}–${t.group.max}`) : `${t.group.min}+`}
            </span>
          )}
        </span>
        {variable ? <Stepper value={t.count} min={t.min} max={t.max} onChange={onCount} label={t.name} /> : <span className="num" style={{ padding: '0 12px' }}>{t.count}</span>}
      </div>
      {!empty && (t.fixed.length > 0 || hasChoices) && (
        <Collapse title="Wargear options" defaultOpen={hasChoices}>
          {t.fixed.length > 0 && (
            <div className="gear-box">
              <div className="gear-box-head">{t.count > 1 ? `Every ${t.name} carries` : 'Default wargear'}</div>
              {t.fixed.map((f) => (
                <div key={f.name} className="gear-row" style={{ cursor: 'default' }}>
                  <span style={{ flex: 1 }}>
                    {f.count > 1 ? `${f.count}× ` : ''}
                    {f.name}
                  </span>
                  <span className="check on">✓</span>
                </div>
              ))}
            </div>
          )}
          {t.groups.map((g) => (
            <div className="gear-box" key={g.key}>
              <div className="gear-box-head">
                {g.name}
                <span className="muted small" style={{ fontWeight: 500 }}>
                  {' '}
                  · {g.chooseOne ? (t.count > 1 ? `one per model — set how many carry each` : 'choose one') : 'any of these'}
                </span>
              </div>
              {g.options.map((o) => (
                <GearRow key={o.key} o={o} count={t.count} onSet={(n) => onCarry(o.key, n, g)} radio={g.chooseOne && t.count === 1} lockOn={g.chooseOne && !g.optional && t.count === 1} />
              ))}
            </div>
          ))}
          {t.extras.length > 0 && (
            <div className="gear-box">
              <div className="gear-box-head">Options</div>
              {t.extras.map((o) => (
                <GearRow key={o.key} o={o} count={t.count} onSet={(n) => onCarry(o.key, n)} />
              ))}
            </div>
          )}
        </Collapse>
      )}
    </>
  );
}

function GearRow({ o, count, onSet, radio, lockOn }: { o: ModelOption; count: number; onSet: (n: number) => void; radio?: boolean; lockOn?: boolean }) {
  const pts = o.points ? <span className="num muted small">+{o.points}</span> : null;
  if (count <= 1) {
    const on = o.carried > 0;
    return (
      <button className="gear-row" role={radio ? 'radio' : 'checkbox'} aria-checked={on} onClick={() => (on ? !lockOn && onSet(0) : onSet(1))}>
        <span style={{ flex: 1 }}>
          {o.name}
          {o.hidden && <div className="small issue-title">Not allowed with the current choices</div>}
        </span>
        {pts}
        <span className={`check ${on ? 'on' : ''}`}>{on ? '✓' : ''}</span>
      </button>
    );
  }
  return (
    <div className="gear-row">
      <span style={{ flex: 1 }}>
        {o.name}
        {o.hidden && <div className="small issue-title">Not allowed with the current choices</div>}
      </span>
      {pts}
      <Stepper value={o.carried} min={0} max={count} onChange={onSet} label={o.name} />
    </div>
  );
}
