import { useState } from 'react';
import { autoFill, instAt, removeAt, setForWholeUnit, setOptionCount, splitOne, type SelPath } from '@/engine/rules/edit';
import type { Inst } from '@/engine/rules/instance';
import { WARLORD_CATEGORY, RosterEngine, type OptionView } from '@/engine/rules/rosterEngine';
import type { RosterUnit } from '@/engine/types';
import { Stepper } from '@/ui/Stepper';

/**
 * The unit editor, laid out like the official app:
 *   Character  — Warlord and Enhancement (optional, with "None")
 *   Unit size  — how many of each model
 *   Models     — one card per model (or group of identical models) with its wargear
 *   Options    — anything else the unit can take
 * After every change the rules' requirements are filled in automatically
 * (e.g. a sergeant's weapon following the squad's).
 */
export function WargearEditor({ engine, unit, onChange }: { engine: RosterEngine; unit: RosterUnit; onChange: (u: RosterUnit) => void }) {
  const engineFor = (u: RosterUnit) => new RosterEngine(engine.index, { ...engine.roster, units: engine.roster.units.map((x) => (x.id === u.id ? u : x)) }, [...engine.roots.values()]);
  const commit = (u: RosterUnit) => onChange(autoFill(engineFor, u));
  const root = engine.unitInst(unit.id);
  if (!root) return null;
  const views = engine.optionsUnder(root);

  // Sort the unit-level options into sections.
  const warlord = findEntry(views, (v) => v.node.categoryIds.includes(WARLORD_CATEGORY) || v.name === 'Warlord');
  const enhGroup = views.find((v) => v.kind === 'group' && /enhancement/i.test(v.name));
  const enhancements = enhGroup ? flatEntries(enhGroup).filter((e) => !e.hidden || e.selected > 0) : [];
  const modelEntries = flatEntries({ children: views } as OptionView).filter((v) => v.node.type === 'model');
  const rest = views.filter((v) => v !== enhGroup && v !== warlord && !(v.kind === 'entry' && v.node.type === 'model') && !(v.kind === 'group' && flatEntries(v).every((e) => e.node.type === 'model')));
  const modelGroups = views.filter((v) => v.kind === 'group' && flatEntries(v).some((e) => e.node.type === 'model'));
  const isSingleModel = root.node?.type === 'model';
  // Shown in the Character section, so never repeated under Options.
  const hidden = new Set([...(warlord ? [warlord.name] : []), 'Warlord', ...enhancements.map((e) => e.name)]);

  const setTop = (key: string, n: number) => commit(setOptionCount(engine, unit, [], key, n));
  const pickEnhancement = (key: string | null) => {
    let u = unit;
    for (const e of enhancements) if (e.selected > 0 && e.node.key !== key) u = setOptionCount(engineFor(u), u, [], e.node.key, 0);
    if (key) u = setOptionCount(engineFor(u), u, [], key, 1);
    commit(u);
  };

  const models = root.children.map((c, i) => ({ c, i })).filter(({ c }) => c.node?.type === 'model' && c.count > 0);

  return (
    <div className="wargear">
      {(warlord || enhancements.length > 0) && (
        <>
          <div className="section-label">Character</div>
          <div className="card">
            {warlord && !(warlord.hidden && !warlord.selected) && (
              <button className="choice" role="switch" aria-checked={warlord.selected > 0} onClick={() => setTop(warlord.node.key, warlord.selected ? 0 : 1)}>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>Warlord</div>
                  <div className="muted small">One Character in your army</div>
                </span>
                <span className={`switch ${warlord.selected ? 'on' : ''}`} aria-hidden="true" />
              </button>
            )}
            {enhancements.length > 0 && (
              <div style={{ borderTop: warlord ? '1px solid var(--line-soft)' : undefined }}>
                <div className="choice-head">Enhancement</div>
                <button className="choice" role="radio" aria-checked={!enhancements.some((e) => e.selected > 0)} onClick={() => pickEnhancement(null)}>
                  <span className="mark" />
                  <span style={{ flex: 1 }}>None</span>
                </button>
                {enhancements.map((e) => (
                  <button key={e.node.key} className="choice" role="radio" aria-checked={e.selected > 0} onClick={() => pickEnhancement(e.selected > 0 ? null : e.node.key)}>
                    <span className="mark" />
                    <span style={{ flex: 1 }}>
                      {e.name}
                      {e.hidden && <div className="small issue-title">Not allowed with the current choices</div>}
                    </span>
                    {e.points ? <span className="num muted small">+{e.points}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {modelEntries.length > 0 && !isSingleModel && (
        <>
          <div className="section-label">Unit size</div>
          <div className="card">
            {modelGroups.map((g) => (
              <SizeGroup key={g.node.key} group={g} onSet={setTop} />
            ))}
            {views
              .filter((v) => v.kind === 'entry' && v.node.type === 'model' && !(v.hidden && !v.selected))
              .map((v) => (
                <SizeRow key={v.node.key} v={v} onSet={setTop} />
              ))}
          </div>
        </>
      )}

      {(models.length > 0 || isSingleModel) && (
        <>
          <div className="section-label">Wargear</div>
          {isSingleModel ? (
            <ModelCard engine={engine} engineFor={engineFor} unit={unit} inst={root} path={[]} title={engine.ev.name(root)} count={1} onChange={commit} single hide={hidden} />
          ) : (
            models.map(({ c, i }) => (
              <ModelCard key={i} engine={engine} engineFor={engineFor} unit={unit} inst={c} path={[i]} title={engine.ev.name(c)} count={c.count} onChange={commit} />
            ))
          )}
        </>
      )}

      {!isSingleModel && rest.some((v) => !(v.hidden && !v.selected)) && (
        <>
          <div className="section-label">Options</div>
          <div className="card">
            <OptionList engine={engine} engineFor={engineFor} unit={unit} path={[]} views={rest} onChange={commit} hide={hidden} />
          </div>
        </>
      )}
    </div>
  );
}

function findEntry(views: OptionView[], test: (v: OptionView) => boolean): OptionView | undefined {
  for (const v of views) {
    if (v.kind === 'entry' && test(v)) return v;
    if (v.kind === 'group' && !/enhancement/i.test(v.name)) {
      const hit = findEntry(v.children, test);
      if (hit) return hit;
    }
  }
  return undefined;
}

function flatEntries(v: OptionView): OptionView[] {
  return v.children.flatMap((c) => (c.kind === 'entry' ? [c] : c.hidden && !c.selected ? [] : flatEntries(c)));
}

function SizeGroup({ group, onSet }: { group: OptionView; onSet: (key: string, n: number) => void }) {
  if (group.hidden && !group.selected) return null;
  const range = group.max > 0 ? (group.min === group.max ? `${group.max}` : `${group.min}–${group.max}`) : group.min ? `${group.min}+` : '';
  const bad = (group.max >= 0 && group.selected > group.max) || group.selected < group.min;
  return (
    <div style={{ borderTop: '1px solid var(--line-soft)' }}>
      <div className="choice-head" style={{ display: 'flex' }}>
        <span style={{ flex: 1 }}>{group.name}</span>
        {range && (
          <span style={{ color: bad ? 'var(--danger)' : undefined }}>
            {group.selected} models · {range}
          </span>
        )}
      </div>
      {group.children.map((c) =>
        c.kind === 'group' ? <SizeGroup key={c.node.key} group={c} onSet={onSet} /> : c.node.type === 'model' && !(c.hidden && !c.selected) ? <SizeRow key={c.node.key} v={c} onSet={onSet} /> : null,
      )}
    </div>
  );
}

function SizeRow({ v, onSet }: { v: OptionView; onSet: (key: string, n: number) => void }) {
  const fixed = v.min === v.max && v.max >= 0;
  return (
    <div className="choice" style={{ cursor: 'default' }}>
      <span style={{ flex: 1 }}>
        {v.name}
        {fixed ? <div className="muted small">always {v.min}</div> : v.max > 0 ? <div className="muted small">up to {v.max}</div> : null}
      </span>
      {v.points ? <span className="num muted small">{v.points} pts</span> : null}
      {fixed ? <span className="num" style={{ padding: '0 16px' }}>{v.selected}</span> : <Stepper value={v.selected} min={v.min} max={v.max} onChange={(n) => onSet(v.node.key, n)} label={v.name} />}
    </div>
  );
}

function ModelCard({
  engine,
  engineFor,
  unit,
  inst,
  path,
  title,
  count,
  onChange,
  single,
  hide,
}: {
  engine: RosterEngine;
  engineFor: (u: RosterUnit) => RosterEngine;
  unit: RosterUnit;
  inst: Inst;
  path: SelPath;
  title: string;
  count: number;
  onChange: (u: RosterUnit) => void;
  single?: boolean;
  hide?: Set<string>;
}) {
  const views = engine.optionsUnder(inst).filter((v) => !(v.hidden && !v.selected) && !hide?.has(v.name) && !(v.kind === 'group' && /enhancement/i.test(v.name)));
  const editable = views.some((v) => v.kind === 'group' || v.max !== v.min || v.selected !== v.min);
  const [open, setOpen] = useState(editable);
  // What this model carries right now.
  const gear = inst.children
    .filter((c) => c.count > 0 && c.node && c.node.type !== 'model' && !hide?.has(engine.ev.name(c)) && engine.ev.name(c) !== 'Warlord')
    .map((c) => (c.count > 1 ? `${c.count}× ${engine.ev.name(c)}` : engine.ev.name(c)))
    .join(', ');
  const parentPath = path.slice(0, -1);
  const siblings = parentPath.length || path.length ? (instAt(engine, unit.id, parentPath)?.children ?? []) : [];
  const sameKind = siblings.filter((s) => s.node?.key === inst.node?.key).length;
  return (
    <div className="card model-card">
      <button className="model-head" onClick={() => editable && setOpen(!open)} aria-expanded={editable ? open : undefined} disabled={!editable} style={editable ? undefined : { cursor: 'default', opacity: 1 }}>
        <span style={{ flex: 1, textAlign: 'left' }}>
          <span className="model-title">
            {!single && <span className="mult">{count}×</span>}
            {title}
          </span>
          {gear && <span className="muted small model-gear">{gear}</span>}
        </span>
        {editable && <span className="chev">{open ? '▾' : '▸'}</span>}
      </button>
      {open && editable && (
        <div className="model-body">
          <OptionList engine={engine} engineFor={engineFor} unit={unit} path={path} views={views} onChange={onChange} hide={hide} />
          {!single && (count > 1 || sameKind > 1) && (
            <div className="btn-row" style={{ margin: '6px 0 0' }}>
              {count > 1 && (
                <button className="btn btn-sm btn-ghost" onClick={() => onChange(splitOne(unit, path))}>
                  Give one of these different wargear
                </button>
              )}
              {sameKind > 1 && (
                <button className="btn btn-sm btn-ghost btn-danger" onClick={() => onChange(removeAt(unit, path))}>
                  Remove this group
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Options under one selection: choose-one groups as radio lists, single options as switches, counted ones as steppers. */
function OptionList({
  engine,
  engineFor,
  unit,
  path,
  views,
  onChange,
  hide,
}: {
  engine: RosterEngine;
  engineFor: (u: RosterUnit) => RosterEngine;
  unit: RosterUnit;
  path: SelPath;
  views: OptionView[];
  onChange: (u: RosterUnit) => void;
  hide?: Set<string>;
}) {
  const set = (key: string, n: number) => onChange(setOptionCount(engine, unit, path, key, n));
  const pts = (v: OptionView) => (v.points ? <span className="num muted small">{v.points > 0 ? `+${v.points}` : v.points}</span> : null);

  const entry = (v: OptionView) => {
    if ((v.hidden && !v.selected) || hide?.has(v.name)) return null;
    const fixed = v.min === v.max && v.max >= 0 && v.selected === v.min;
    if (fixed) {
      return (
        <div key={v.node.key} className="choice fixed-gear">
          <span style={{ flex: 1 }}>
            {v.selected > 1 ? `${v.selected}× ` : ''}
            {v.name}
          </span>
          {pts(v)}
        </div>
      );
    }
    if (v.max === 1) {
      const on = v.selected > 0;
      return (
        <button key={v.node.key} className="choice" role="switch" aria-checked={on} onClick={() => set(v.node.key, on ? 0 : 1)} disabled={on && v.min >= 1}>
          <span style={{ flex: 1 }}>{v.name}</span>
          {pts(v)}
          <span className={`switch ${on ? 'on' : ''}`} aria-hidden="true" />
        </button>
      );
    }
    return (
      <div key={v.node.key} className="choice" style={{ cursor: 'default' }}>
        <span style={{ flex: 1 }}>
          {v.name}
          {v.max > 0 && <div className="muted small">up to {v.max}</div>}
        </span>
        {pts(v)}
        <Stepper value={v.selected} min={v.min} max={v.max} onChange={(n) => set(v.node.key, n)} label={v.name} />
      </div>
    );
  };

  const group = (g: OptionView) => {
    if ((g.hidden && !g.selected) || /enhancement/i.test(g.name)) return null;
    const entries = g.children.filter((c) => c.kind === 'entry' && !(c.hidden && !c.selected));
    const chooseOne = g.max === 1 && entries.length === g.children.filter((c) => !(c.hidden && !c.selected)).length && entries.length > 1;
    if (chooseOne) {
      // A choice forced by the rest of the unit ("all models must carry the same weapon").
      const locked = entries.some((e) => e.min >= 1 && e.selected > 0) && entries.filter((e) => e.min >= 1).length === 1;
      return (
        <div key={g.node.key} className="opt-group">
          <div className="choice-head">
            {g.name}
            {locked && <span className="muted"> · matches the rest of the unit</span>}
          </div>
          {g.min === 0 && (
            <button className="choice" role="radio" aria-checked={g.selected === 0} onClick={() => entries.filter((e) => e.selected).forEach((e) => set(e.node.key, 0))}>
              <span className="mark" />
              <span style={{ flex: 1 }}>None</span>
            </button>
          )}
          {entries.map((e) => {
            const on = e.selected > 0;
            return (
              <button
                key={e.node.key}
                className="choice"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  if (on) {
                    if (g.min === 0) set(e.node.key, 0);
                    return;
                  }
                  if (locked) onChange(setForWholeUnit(engineFor, unit, e.name));
                  else set(e.node.key, 1);
                }}
              >
                <span className="mark" />
                <span style={{ flex: 1 }}>{e.name}</span>
                {pts(e)}
              </button>
            );
          })}
          {locked && <div className="small muted" style={{ padding: '0 14px 10px' }}>Picking another one changes it for the whole unit.</div>}
        </div>
      );
    }
    const range = g.max === g.min && g.max > 0 ? `${g.max}` : g.max > 0 ? `${g.min}–${g.max}` : g.min > 0 ? `${g.min}+` : '';
    const bad = (g.max >= 0 && g.selected > g.max) || g.selected < g.min;
    return (
      <div key={g.node.key} className="opt-group">
        <div className="choice-head" style={{ display: 'flex' }}>
          <span style={{ flex: 1 }}>{g.name}</span>
          {range && <span style={{ color: bad ? 'var(--danger)' : undefined }}>{`${g.selected} of ${range}`}</span>}
        </div>
        {g.children.map((c) => (c.kind === 'group' ? group(c) : entry(c)))}
      </div>
    );
  };

  return <>{views.map((v) => (v.kind === 'group' ? group(v) : entry(v)))}</>;
}

