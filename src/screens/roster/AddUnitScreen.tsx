import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { db } from '@/data/db';
import { saveRoster, useRosterEngine } from '@/data/gameData';
import { newUnit } from '@/engine/rules/edit';
import { allWeapons, datasheet, unitModels } from '@/engine/rules/models';
import { RosterEngine } from '@/engine/rules/rosterEngine';
import { allyName, choiceRole, ROLES } from '@/engine/rules/roles';
import { setShowOptions, showOptions } from '@/engine/rules/config';
import { legendsFit } from '@/engine/rules/legends';
import { Collapse } from '@/ui/Collapse';
import { Sheet } from '@/ui/Sheet';
import { Composition } from '@/ui/Composition';
import { AbilityList, RuleChips, StatLine, WeaponTable } from '@/ui/DatasheetView';
import { weaponCounts } from '@/engine/weaponGrid';
import { PinButton, pinId, usePinnedNames } from '@/ui/PinButton';
import { Term } from '@/ui/RulesText';
import { showToast } from '@/ui/Toast';
import { useFactionTheme } from '@/theme/themes';
import { useAppearance } from '@/theme/appearance';
import { Screen } from '@/ui/Screen';
import { Icon } from '@/ui/Icon';
import { isLegends, LegendsTag, legendsName } from '@/ui/Legends';

const FILTERS = ['All', ...ROLES] as const;
const SHORT: Record<string, string> = { 'Dedicated Transports': 'Transports' };

function rank(name: string, q: string): number {
  const n = name.toLowerCase();
  if (!q) return 0;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.split(/[\s-]+/).some((w) => w.startsWith(q))) return 2;
  if (n.includes(q)) return 3;
  return -1;
}

export function AddUnitScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const roster = useLiveQuery(() => db.rosters.get(id), [id]);
  const { engine, index } = useRosterEngine(roster);
  useFactionTheme(roster?.factionName);
  const [q, setQ] = useState('');
  const [params] = useSearchParams();
  const [role, setRole] = useState<(typeof FILTERS)[number]>(() => (FILTERS as readonly string[]).includes(params.get('role') ?? '') ? (params.get('role') as (typeof FILTERS)[number]) : 'All');
  const [preview, setPreview] = useState<string | null>(null);
  const previewData = useMemo(() => {
    if (!engine || !roster || !preview) return undefined;
    const unit = newUnit(engine, preview);
    const e2 = new RosterEngine(engine.index, { ...roster, units: [...roster.units, unit] }, [...engine.roots.values()]);
    const inst = e2.unitInst(unit.id)!;
    const models = unitModels(e2, unit.id);
    const defaults = [...models.weapons.values()];
    const sig = (w: { name: string; melee: boolean }) => `${w.name.toLowerCase()}|${w.melee}`;
    const have = new Set(defaults.map(sig));
    const options = inst.node ? allWeapons(engine.index, inst.node).filter((w) => !have.has(sig(w))) : [];
    return { name: e2.unitName(unit.id), points: e2.unitPoints(unit.id), sheet: datasheet(e2, inst), models, defaults, options };
  }, [engine, roster, preview]);

  // Datasheets the data hides behind its "Show …" switches: allies ("Show Imperial
  // Agents / Knights / Titans") and Legends. Look with each switch on, list what
  // appears, and turn the switch on for this list when one is added.
  const configKey = JSON.stringify(roster?.config ?? []);
  type Extra = { choice: ReturnType<RosterEngine['unitChoices']>[number]; needs: string[]; ally?: string; legends: boolean };
  const extras = useMemo(() => {
    if (!engine || !roster) return [] as Extra[];
    const base = { ...roster, units: [] };
    const roots = [...engine.roots.values()];
    const e0 = new RosterEngine(engine.index, base, roots);
    const visible = new Set(e0.unitChoices().map((c) => c.root.key));
    const out: Extra[] = [];
    const seen = new Set<string>();
    const opts = showOptions(e0).filter((x) => !x.hidden && !x.on);
    const legends = opts.find((x) => /^show legends$/i.test(x.name));
    const allySwitches = opts.filter((x) => /^show (imperial|chaos|titans|.*daemons|.*knights|.*agents)/i.test(x.name) && !/legend|unaligned/i.test(x.name));
    const collect = (needs: string[]) => {
      const e = needs.length ? new RosterEngine(engine.index, setShowOptions(e0, base, Object.fromEntries(needs.map((k) => [k, true]))), roots) : e0;
      for (const c of e.unitChoices()) {
        if (seen.has(c.root.key)) continue;
        const ally = choiceRole(e, c.root.node, c.category) === 'Allied units';
        const isLegend = isLegends(c.name);
        if (!ally && !isLegend) continue;
        seen.add(c.root.key);
        out.push({ choice: c, needs: visible.has(c.root.key) ? [] : needs, ally: ally ? allyName(e, c.root.node) : undefined, legends: isLegend });
      }
    };
    collect([]);
    for (const o of allySwitches) collect([o.key]);
    if (legends) {
      collect([legends.key]);
      for (const o of allySwitches) collect([o.key, legends.key]);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine?.index, roster?.catalogueId, configKey]);
  const needsOf = useMemo(() => new Map(extras.filter((a) => a.needs.length).map((a) => [a.choice.root.key, a.needs])), [extras]);
  // Legends are offered only when turned on in Settings.
  const showLegends = useAppearance().legends === 'shown';
  const choices = useMemo(() => {
    if (!engine) return [];
    // Allies the army can take without Legends: Legends from other allies stay out.
    const allowedAllies = new Set(extras.filter((a) => a.ally && !a.legends).map((a) => a.ally!));
    const own = engine.unitChoices();
    const have = new Set(own.map((c) => c.root.key));
    return [...own, ...extras.filter((a) => !have.has(a.choice.root.key)).map((a) => a.choice)].filter((c) => (showLegends || !isLegends(c.name)) && legendsFit(engine, c, allowedAllies));
  }, [engine, extras, showLegends]);
  const allyOf = useMemo(() => new Map(extras.filter((a) => a.ally).map((a) => [a.choice.root.key, a.ally!])), [extras]);
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return choices
      .map((c) => {
        const cat = engine?.index.categories.get(c.category ?? '')?.name ?? '';
        const r = allyOf.has(c.root.key) ? 'Allied units' : engine ? choiceRole(engine, c.root.node, c.category) : 'Other datasheets';
        return { ...c, role: r, cat, ally: allyOf.get(c.root.key), score: rank(c.name, query) };
      })
      .filter((c) => c.score >= 0 && (role === 'All' || c.role === role))
      .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  }, [choices, q, role, engine, allyOf]);
  const allyGroups = useMemo(() => {
    const m = new Map<string, typeof list>();
    list.forEach((c) => c.ally && m.set(c.ally, [...(m.get(c.ally) ?? []), c]));
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [list]);

  /** Add a unit and stay here, so several can be added in a row. */
  const add = async (key: string, open = false) => {
    if (!engine || !roster) return;
    // An ally behind a Show switch: turn the switch on for this list first.
    const needs = needsOf.get(key);
    const r = needs ? setShowOptions(engine, roster, Object.fromEntries(needs.map((k) => [k, true]))) : roster;
    const e = needs ? new RosterEngine(engine.index, r, [...engine.roots.values()]) : engine;
    const unit = newUnit(e, key);
    await saveRoster(index, { ...r, units: [...r.units, unit] });
    if (open) navigate(`/roster/${roster.id}/unit/${unit.id}`, { replace: true });
    else showToast(`Added ${unit.name}`, { label: 'EDIT', to: `/roster/${roster.id}/unit/${unit.id}` });
  };

  const inList = (key: string) => roster?.units.filter((u) => u.entryId === key).length ?? 0;

  const pinned = usePinnedNames('datasheet');
  const isPinned = (name: string) => pinned.has(name.toLowerCase());
  const pinnedList = list.filter((c) => isPinned(c.name));
  const row = (c: (typeof list)[number]) => {
    const n = inList(c.root.key);
    return (
      <div key={c.root.key} style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid var(--line-soft)' }}>
        <button className="choice" style={{ borderTop: 0, flex: 1 }} onClick={() => setPreview(c.root.key)}>
          <span style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>
              {legendsName(c.name)}
              {isLegends(c.name) && <LegendsTag />}
            </div>
            <div className="muted small">
              {c.role === 'Allied units' ? `${c.ally ?? 'Allied'} · ${c.cat}` : c.cat}
              {n ? ` · ${n} in list` : ''}
            </div>
          </span>
          <span className="num muted">{c.points}</span>
        </button>
        <PinButton small pin={{ id: pinId('datasheet', c.name), kind: 'datasheet', name: c.name, route: `/reference/unit/${roster?.catalogueId}/${c.root.key}`, source: `${c.points} pts` }} />
        <button className="icon-btn add-btn" aria-label={`Add ${c.name}`} title="Add to list" onClick={() => add(c.root.key)}>
          <Icon name="plus" />
        </button>
      </div>
    );
  };

  return (
    <Screen title="Add unit" back={`/roster/${id}`}>
      <input className="input" placeholder="Search units" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search units" />
      <p className="small muted" style={{ margin: '6px 0 2px' }}>Tap a unit to read it first, or + to add it straight away — you stay here to add more.</p>
      <div className="filters" role="tablist">
        {FILTERS.map((r) => (
          <button key={r} className={`filter ${role === r ? 'on' : ''}`} onClick={() => setRole(r)} role="tab" aria-selected={role === r}>
            {SHORT[r] ?? r}
          </button>
        ))}
      </div>
      {!engine && <p className="muted">Loading units…</p>}
      {pinnedList.length > 0 && !q.trim() && (
        <>
          <div className="section-label">Pinned</div>
          <div className="card">{pinnedList.map(row)}</div>
          <div className="section-label">{role === 'All' ? 'All units' : (SHORT[role] ?? role)}</div>
        </>
      )}
      {role === 'Allied units' && !q.trim() ? (
        allyGroups.map(([ally, units]) => (
          <Collapse key={ally} title={ally} right={<span className="muted small num">{units.length}</span>}>
            <div className="card">{units.map(row)}</div>
          </Collapse>
        ))
      ) : (
        <div className="card">{list.map(row)}</div>
      )}
      {engine && list.length === 0 && <p className="muted">No units match.</p>}
      {roster && (
        <div className="sticky-bar">
          <span className="pts-chip">{(engine?.totalPoints() ?? 0).toLocaleString('en')} / {(engine?.pointsLimit() ?? roster.pointsLimit).toLocaleString('en')}</span>
          <span className="muted small" style={{ flex: 1 }}>
            {roster.units.length} units in the list
          </span>
          <button className="btn btn-sm btn-primary" onClick={() => navigate(`/roster/${roster.id}`, { replace: true })}>
            Done
          </button>
        </div>
      )}
      <Sheet open={Boolean(preview)} onClose={() => setPreview(null)} title={previewData?.name}>
        {previewData && preview && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="num">{previewData.points} pts</span>
              <span className="muted small" style={{ flex: 1 }}>
                default loadout
              </span>
              <PinButton pin={{ id: pinId('datasheet', previewData.name), kind: 'datasheet', name: previewData.name, route: `/reference/unit/${roster?.catalogueId}/${preview}`, source: `${previewData.points} pts` }} />
            </div>
            <button className="btn btn-primary btn-block" style={{ margin: '10px 0' }} onClick={() => (add(preview), setPreview(null))}>
              Add to list
            </button>
            {previewData.sheet.stats.map((p) => (
              <StatLine key={p.id + p.name} profile={p} />
            ))}
            <div className="section-label">Models</div>
            <Composition models={previewData.models} />
            {previewData.defaults.length > 0 && (
              <Collapse title="Weapons" right={<span className="muted small num">{previewData.defaults.length}</span>}>
                <WeaponTable weapons={previewData.defaults.filter((w) => !w.melee)} index={engine?.index} melee={false} counts={weaponCounts(previewData.models.loadouts, previewData.models.models)} />
                <WeaponTable weapons={previewData.defaults.filter((w) => w.melee)} index={engine?.index} melee counts={weaponCounts(previewData.models.loadouts, previewData.models.models)} />
              </Collapse>
            )}
            {previewData.options.length > 0 && (
              <Collapse title="Other weapon options" right={<span className="muted small num">{previewData.options.length}</span>}>
                <WeaponTable weapons={previewData.options.filter((w) => !w.melee)} index={engine?.index} melee={false} />
                <WeaponTable weapons={previewData.options.filter((w) => w.melee)} index={engine?.index} melee />
              </Collapse>
            )}
            {(previewData.sheet.abilities.length > 0 || previewData.sheet.rules.length > 0) && <div className="section-label">Abilities</div>}
            <RuleChips rules={previewData.sheet.rules} index={engine?.index} />
            <AbilityList abilities={previewData.sheet.abilities} index={engine?.index} />
            <div className="section-label">Keywords</div>
            <div className="kw-list">
              {previewData.sheet.keywords.map((k) => (
                <Term key={k} term={k} index={engine?.index} upper />
              ))}
            </div>
          </>
        )}
      </Sheet>
    </Screen>
  );
}
