import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '@/data/db';
import { saveRoster, useRosterEngine } from '@/data/gameData';
import { instAt, removeAt, setOptionCount, splitOne, type SelPath } from '@/engine/rules/edit';
import { datasheet, unitModels } from '@/engine/rules/models';
import { childNodes } from '@/engine/rules/nodes';
import type { OptionView, RosterEngine } from '@/engine/rules/rosterEngine';
import type { RawProfile } from '@/engine/bsdata/raw';
import type { Roster, RosterUnit } from '@/engine/types';
import { useFactionTheme } from '@/theme/themes';
import { AbilityList, DatasheetView } from '@/ui/DatasheetView';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { Stepper } from '@/ui/Stepper';
import { WeaponGridView } from '@/ui/WeaponGridView';
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
  const dead = Object.entries(roster.tracking ?? {}).flatMap(([uid, ids]) => ids.map((m) => `${uid}/${m}`));

  const toggleModel = (prefixed: string, alive: boolean) => {
    const [uid, ...rest] = prefixed.split('/');
    const mid = rest.join('/');
    save((r) => {
      const t = { ...(r.tracking ?? {}) };
      const list = new Set(t[uid!] ?? []);
      if (alive) list.delete(mid);
      else list.add(mid);
      t[uid!] = [...list];
      return { ...r, tracking: t };
    });
  };

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
            {t === 'models' ? (attached.length ? 'Combined' : 'Models') : t === 'wargear' ? 'Wargear' : 'Datasheet'}
          </button>
        ))}
      </div>

      {tab === 'models' && combined && (
        <>
          {attached.length > 0 && (
            <p className="muted small">
              {unit.name} led by {attached.map((a) => a.nickname || a.name).join(' and ')}. Tap a row to remove a model; totals update.
            </p>
          )}
          {!attached.length && <p className="muted small">Tap a row to see single models and remove one; totals update.</p>}
          <WeaponGridView loadouts={combined.loadouts} models={combined.models} weapons={combined.weapons} dead={dead} onToggle={toggleModel} />
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

      {tab === 'wargear' && engine && <OptionEditor engine={engine} unit={unit} path={[]} onChange={saveUnit} />}

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

/** Wargear and model choices for one selection, recursively. */
function OptionEditor({ engine, unit, path, onChange, depth = 0 }: { engine: RosterEngine; unit: RosterUnit; path: SelPath; onChange: (u: RosterUnit) => void; depth?: number }) {
  const inst = instAt(engine, unit.id, path);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  if (!inst) return null;
  const views = engine.optionsUnder(inst);
  const set = (key: string, n: number) => onChange(setOptionCount(engine, unit, path, key, n));

  const hasOptions = (i: number) => {
    const child = inst.children.find((c) => c.sel === inst.sel?.children[i]);
    if (!child?.node) return false;
    return childNodes(engine.index, child.node).length > 0 && engine.optionsUnder(child).some((v) => !v.hidden && (v.kind === 'group' || v.max !== v.min || v.selected !== v.min));
  };

  const selectionDetails = (v: OptionView) =>
    v.indices.map((i) => {
      const sel = inst.sel?.children[i];
      if (!sel) return null;
      const expandable = hasOptions(i);
      if (!expandable && sel.count < 2) return null;
      return (
        <div key={i} style={{ paddingLeft: 14, borderLeft: '2px solid var(--line)', margin: '4px 0 8px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))} aria-expanded={Boolean(open[i])}>
              {open[i] ? '▾' : '▸'} {sel.count > 1 ? `${sel.count}× ` : ''}
              {v.name} options
            </button>
            {sel.count > 1 && (
              <button className="btn btn-sm btn-ghost" onClick={() => onChange(splitOne(unit, [...path, i]))} title="Split one model off to give it different wargear">
                Split one off
              </button>
            )}
            {v.indices.length > 1 && v.selected > v.min && (
              <button className="btn btn-sm btn-ghost btn-danger" onClick={() => onChange(removeAt(unit, [...path, i]))}>
                Remove
              </button>
            )}
          </div>
          {open[i] && expandable && <OptionEditor engine={engine} unit={unit} path={[...path, i]} onChange={onChange} depth={depth + 1} />}
        </div>
      );
    });

  const entryRow = (v: OptionView, radioGroup?: OptionView) => {
    if (v.hidden && v.selected === 0) return null;
    const fixed = v.min === v.max && v.selected === v.min && v.max !== -1;
    const single = v.max === 1;
    const checked = v.selected > 0;
    const pts = v.points ? <span className="num muted small">{v.points > 0 ? `+${v.points}` : v.points}</span> : null;
    let control;
    if (radioGroup) {
      control = (
        <button className="choice" role="radio" aria-checked={checked} onClick={() => !checked && set(v.node.key, 1)}>
          <span className="mark" />
          <span style={{ flex: 1 }}>{v.name}</span>
          {pts}
        </button>
      );
    } else if (fixed) {
      control = (
        <div className="choice" style={{ cursor: 'default' }}>
          <span style={{ flex: 1 }}>
            {v.selected > 1 ? `${v.selected}× ` : ''}
            {v.name}
          </span>
          {pts}
        </div>
      );
    } else if (single) {
      control = (
        <button className="choice" role="checkbox" aria-checked={checked} onClick={() => set(v.node.key, checked ? 0 : 1)} disabled={checked && v.min >= 1}>
          <span className="mark square" />
          <span style={{ flex: 1 }}>{v.name}</span>
          {pts}
        </button>
      );
    } else {
      control = (
        <div className="choice" style={{ cursor: 'default' }}>
          <span style={{ flex: 1 }}>
            {v.name}
            {v.max > 0 && <div className="muted small">up to {v.max}</div>}
          </span>
          {pts}
          <Stepper value={v.selected} min={v.min} max={v.max} onChange={(n) => set(v.node.key, n)} label={v.name} />
        </div>
      );
    }
    return (
      <div key={v.node.key}>
        {control}
        {v.hidden && <div className="small issue-title" style={{ padding: '0 14px 8px' }}>Not allowed with the current choices</div>}
        {selectionDetails(v)}
      </div>
    );
  };

  const renderViews = (list: OptionView[], nested: boolean) =>
    list.map((v) => {
      if (v.kind === 'entry') return entryRow(v);
      if (v.hidden && v.selected === 0) return null;
      const entries = v.children.filter((c) => c.kind === 'entry');
      const chooseOne = v.max === 1 && entries.length === v.children.length && entries.length > 1;
      const range = v.max === v.min && v.max > 0 ? `${v.max}` : v.max > 0 ? `${v.min}–${v.max}` : v.min > 0 ? `${v.min}+` : '';
      const bad = (v.max >= 0 && v.selected > v.max) || v.selected < v.min;
      return (
        <div key={v.node.key} style={nested ? { marginLeft: 8 } : undefined}>
          <div className="section-label" style={{ display: 'flex', gap: 8 }}>
            <span>{v.name}</span>
            {range && (
              <span style={{ color: bad ? 'var(--danger)' : undefined }}>
                {chooseOne ? 'choose 1' : `${v.selected} of ${range}`}
              </span>
            )}
          </div>
          <div className="card">{chooseOne ? entries.map((e) => entryRow(e, v)) : renderViews(v.children, true)}</div>
        </div>
      );
    });

  const topEntries = views.filter((v) => v.kind === 'entry' && !(v.hidden && v.selected === 0));
  return (
    <div>
      {topEntries.length > 0 && (
        <>
          {depth === 0 && <div className="section-label">Options</div>}
          <div className="card">{topEntries.map((v) => entryRow(v))}</div>
        </>
      )}
      {renderViews(
        views.filter((v) => v.kind === 'group'),
        false,
      )}
    </div>
  );
}
