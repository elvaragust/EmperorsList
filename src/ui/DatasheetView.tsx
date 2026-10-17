import { abilityKind } from '@/engine/rules/abilityKind';
import { protections, type Protection } from '@/engine/rules/protections';
import { KindIcon } from './KindIcon';
import { lookupRule } from '@/engine/rules/glossary';
import type { DataIndex } from '@/engine/bsdata/index';
import type { RawProfile } from '@/engine/bsdata/raw';
import type { Datasheet } from '@/engine/rules/models';
import { ruleText } from '@/engine/rules/nodes';
import type { WeaponProfile } from '@/engine/types';
import { Fragment, type ReactNode } from 'react';
import { Collapse } from './Collapse';
import { RulesText, Term } from './RulesText';
import { useRulePopup } from './RulePopup';

const STAT_ORDER = ['M', 'T', 'SV', 'W', 'LD', 'OC'];

export function StatLine({ profile }: { profile: RawProfile }) {
  const chars = profile.characteristics ?? [];
  const ordered = STAT_ORDER.map((k) => chars.find((c) => c.name.toUpperCase() === k)).filter(Boolean);
  const list = ordered.length >= 4 ? ordered : chars.slice(0, 6);
  return (
    <div style={{ margin: '8px 0' }}>
      <div className="small muted" style={{ marginBottom: 4 }}>
        {profile.name}
      </div>
      <div className="stats" style={{ gridTemplateColumns: `repeat(${list.length}, 1fr)` }}>
        {list.map((c) => (
          <div key={c!.name}>
            <div className="k">{c!.name.toUpperCase()}</div>
            <div className="v">{c!.$text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeaponTable({
  weapons,
  index,
  melee,
  counts,
  groups,
}: {
  weapons: WeaponProfile[];
  index?: DataIndex;
  melee: boolean;
  counts?: Map<string, number>;
  /** Weapons unit by unit (a squad and the characters leading it): listed with a divider between units. */
  groups?: { name: string; ids: string[] }[];
}) {
  if (!weapons.length) return null;
  const byId = new Map(weapons.map((w) => [w.id, w]));
  const sections = (groups ?? [])
    .map((g) => ({ name: g.name, list: g.ids.map((id) => byId.get(id)).filter((w): w is WeaponProfile => Boolean(w)) }))
    .filter((g) => g.list.length);
  const split = sections.length > 1;
  const seen = new Set<string>();
  const row = (w: WeaponProfile, k: string) => {
    const first = !seen.has(w.id);
    seen.add(w.id);
    return (
      <tr key={k} id={first ? `weapon-${w.id}` : undefined}>
        <td>
          {(counts?.get(w.id) ?? 0) > 1 && <span className="weapon-count">{counts!.get(w.id)}×</span>}
          {w.name}
          {w.keywords.length > 0 && (
            <div className="wkw">
              {w.keywords.map((kw, i) => (
                <span key={kw}>
                  {i > 0 && ', '}
                  <Term term={kw} index={index} />
                </span>
              ))}
            </div>
          )}
        </td>
        <td>{w.range}</td>
        <td>{w.attacks}</td>
        <td>{w.skill}</td>
        <td>{w.strength}</td>
        <td>{w.ap}</td>
        <td>{w.damage}</td>
      </tr>
    );
  };
  return (
    <table className="wtable">
      <thead>
        <tr>
          <th>{melee ? 'Melee' : 'Ranged'}</th>
          <th>Range</th>
          <th>A</th>
          <th>{melee ? 'WS' : 'BS'}</th>
          <th>S</th>
          <th>AP</th>
          <th>D</th>
        </tr>
      </thead>
      <tbody>
        {split
          ? sections.map((g) => (
              <Fragment key={g.name}>
                <tr className="wgroup">
                  <td colSpan={7}>{g.name}</td>
                </tr>
                {g.list.map((w) => row(w, `${g.name}-${w.id}`))}
              </Fragment>
            ))
          : weapons.map((w) => row(w, w.id))}
      </tbody>
    </table>
  );
}

export function AbilityList({ abilities, index, highlight }: { abilities: RawProfile[]; index?: DataIndex; highlight?: (a: RawProfile) => string | undefined }) {
  return (
    <>
      {abilities.map((a) => {
        const text = a.characteristics?.map((c) => c.$text ?? '').join('\n') ?? '';
        const tag = highlight?.(a);
        return (
          <div key={a.id + a.name} className="ability">
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong>{a.name}</strong>
              <KindIcon kind={abilityKind(a.name, text)} />
              {tag && <span className="tag">{tag}</span>}
            </div>
            <RulesText text={text} index={index} />
          </div>
        );
      })}
    </>
  );
}

/** Unit profiles as one table: a row per kind of model, identical rows merged. */
export function StatTable({ profiles }: { profiles: { name: string; profile: RawProfile }[] }) {
  const rows: { names: string[]; chars: { k: string; v: string }[] }[] = [];
  // The data keeps invulnerable saves in an "InSv" characteristic: show it as an INV column when anyone has one.
  const invOf = (p: RawProfile) => p.characteristics?.find((c) => /^(insv|inv(ulnerable)?( save)?)$/i.test(c.name))?.$text?.trim() ?? '';
  const anyInv = profiles.some((x) => invOf(x.profile));
  for (const { name, profile } of profiles) {
    const chars = profile.characteristics ?? [];
    const ordered = STAT_ORDER.map((k) => chars.find((c) => c.name.toUpperCase() === k)).filter(Boolean);
    const list = (ordered.length >= 4 ? ordered : chars.slice(0, 6)).map((c) => ({ k: c!.name.toUpperCase(), v: c!.$text ?? '' }));
    if (anyInv) list.push({ k: 'INV', v: invOf(profile) || '–' });
    const sig = list.map((c) => `${c.k}=${c.v}`).join('|');
    const same = rows.find((r) => r.chars.map((c) => `${c.k}=${c.v}`).join('|') === sig);
    if (same) {
      if (!same.names.includes(name)) same.names.push(name);
    } else rows.push({ names: [name], chars: list });
  }
  if (!rows.length) return null;
  const head = rows[0]!.chars.map((c) => c.k);
  return (
    <table className="stat-table">
      <thead>
        <tr>
          {rows.length > 1 && <th />}
          {head.map((k) => (
            <th key={k}>{k}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.names.join()}>
            {rows.length > 1 && <td className="stat-name">{r.names.join(' / ')}</td>}
            {r.chars.map((c) => (
              <td key={c.k} className="v">
                {c.v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Leader / Support: who this character can join — rarely needed, so it lives in the fold at the bottom. */
const isAttachRule = (a: RawProfile) => /^(leader|support)$/i.test(a.name);

/**
 * The unit's rule chips as the official app groups them: "Core" (Infiltrators,
 * Deep Strike…) and "Faction" (Oath of Moment, Combat Doctrines…), each tappable.
 */
export function RuleChips({ rules, index }: { rules: { name: string }[]; index?: DataIndex }) {
  const kind = (n: string) => (index ? lookupRule(index, n)?.kind : undefined);
  // Weapon abilities (Pistol, Anti-, Extra Attacks…) are on the weapons; army rules are in the Rules tab.
  rules = rules.filter((r) => kind(r.name) !== 'weaponAbility' && kind(r.name) !== 'army');
  if (!rules.length) return null;
  const groups: [string, { name: string }[]][] = [['Core', rules]];
  return (
    <div className="rule-chips">
      {groups
        .filter(([, list]) => list.length)
        .map(([label, list]) => (
          <div key={label} className="rule-chip-row">
            <span className="small muted">{label}:</span>
            {list.map((r) => (
              <Term key={r.name} term={r.name} index={index} />
            ))}
          </div>
        ))}
    </div>
  );
}

/** Detachment rules that concern this unit, tappable like the other rules. */
export function DetachmentRuleChips({ rules, index }: { rules: { name: string; text: string; detachment: string }[]; index?: DataIndex }) {
  const popup = useRulePopup();
  if (!rules.length) return null;
  return (
    <div className="rule-chip-row">
      <span className="small muted">Detachment:</span>
      {rules.map((r) => (
        <button key={r.detachment + r.name} className="kw" onClick={() => popup.openDef({ name: r.name, text: r.text, kind: 'detachment', source: r.detachment }, index)}>
          {r.name}
        </button>
      ))}
    </div>
  );
}


/** Invulnerable saves and Feel No Pain, said plainly, above the stats. */
export function SavesStrip({ items }: { items: Protection[] }) {
  if (!items.length) return null;
  // Invulnerable saves first, then Feel No Pain; one box, a row each.
  const sorted = [...items].sort((a, b) => Number(a.kind === 'Feel No Pain') - Number(b.kind === 'Feel No Pain'));
  return (
    <div className="saves-box">
      {sorted.map((p, i) => (
        <div key={i} className="save-row">
          <span className="save-kind">{p.kind === 'Feel No Pain' ? 'Feel No Pain' : 'Invuln'}</span>
          <span className="save-value num">{p.value}</span>
          <span className="save-note">{[p.against ? `vs ${p.against}` : '', p.only ? `${p.only} only` : 'whole unit'].filter(Boolean).join(' · ')}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * One datasheet, the same everywhere (list builder, reference, battle,
 * opponent): profiles, weapons, then every ability in one list — the unit's
 * own and those of characters leading it, tagged — and a fold at the bottom
 * for Leader/Support, keywords and the rest.
 */
export function DatasheetView({
  sheet,
  weapons,
  index,
  attached = [],
  showWeapons = true,
  top,
  detachmentRules = [],
  weaponCounts,
  weaponGroups,
}: {
  /** The unit's and each leader's weapons, for dividers in the weapon tables. */
  weaponGroups?: { name: string; ids: string[] }[];
  /** How many of each weapon the unit carries ("2×" next to the name). */
  weaponCounts?: Map<string, number>;
  /** The list's detachment rules that concern this unit. */
  detachmentRules?: { name: string; text: string; detachment: string }[];
  sheet: Datasheet;
  weapons: WeaponProfile[];
  index?: DataIndex;
  /** Characters leading this unit: their profiles and abilities are folded in. */
  attached?: { name: string; sheet: Datasheet }[];
  showWeapons?: boolean;
  /** Extra content at the top of the bottom fold (e.g. buttons). */
  top?: ReactNode;
}) {
  const all = [{ name: sheet.name, sheet, own: true }, ...attached.map((a) => ({ ...a, own: false }))];
  const profiles = all.flatMap((x) => x.sheet.stats.map((p) => ({ name: p.name, profile: p })));
  const rules = [...new Map(all.flatMap((x) => x.sheet.rules).map((r) => [r.name, r])).values()];
  const abilities = all.flatMap((x) => x.sheet.abilities.filter((a) => !isAttachRule(a)).map((a) => ({ a, from: x.own ? undefined : x.name })));
  const attachRules = all.flatMap((x) => x.sheet.abilities.filter(isAttachRule).map((a) => ({ a, from: x.name })));
  const other = all.flatMap((x) => x.sheet.other.map((p) => ({ p, from: x.name })));
  const keywords = [...new Set(all.flatMap((x) => x.sheet.keywords))];
  const factionKeywords = [...new Set(all.flatMap((x) => x.sheet.factionKeywords))];
  return (
    <div className="datasheet">
      <SavesStrip items={protections(all.map((x) => ({ name: x.name, own: x.own, abilities: x.sheet.abilities, rules: x.sheet.rules, stats: x.sheet.stats })))} />
      <StatTable profiles={profiles} />
      {showWeapons && (
        <>
          <WeaponTable weapons={weapons.filter((w) => !w.melee)} index={index} melee={false} counts={weaponCounts} groups={weaponGroups} />
          <div style={{ height: 8 }} />
          <WeaponTable weapons={weapons.filter((w) => w.melee)} index={index} melee counts={weaponCounts} groups={weaponGroups} />
        </>
      )}
      <div className="section-label">Abilities</div>
      <RuleChips rules={rules} index={index} />
      {abilities.map(({ a, from }) => {
        const text = a.characteristics?.map((c) => c.$text ?? '').join('\n') ?? '';
        const buffs = from && /while this model is leading|this model's unit|the unit this model is leading|models in this model's unit|bodyguard/i.test(text);
        return (
          <div key={(from ?? '') + a.id + a.name} className="ability">
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong>{a.name}</strong>
              {from && <span className="tag from-tag">{from.toUpperCase()}</span>}
              {buffs && <span className="tag">BUFFS THE UNIT</span>}
              {/invulnerable save|feel no pain/i.test(`${a.name} ${text}`) && (
                <span className="tag save-scope">{from && !buffs ? `${from.toUpperCase()} ONLY` : 'WHOLE UNIT'}</span>
              )}
              <KindIcon kind={abilityKind(a.name, text)} />
            </div>
            <RulesText text={text} index={index} />
          </div>
        );
      })}
      {other.map(({ p, from }) => (
        <div key={from + p.id} className="ability">
          <strong>{p.name}</strong> <span className="muted small">{p.typeName}</span>
          <RulesText text={p.characteristics?.map((c) => `${c.name}: ${c.$text ?? ''}`).join('\n') ?? ''} index={index} />
        </div>
      ))}
      {detachmentRules.length > 0 && (
        <div className="det-rules">
          <Collapse title={`Detachment rules · ${detachmentRules.length}`}>
            {detachmentRules.map((r) => (
              <div key={r.detachment + r.name} className="ability">
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong>{r.name}</strong>
                  <span className="tag from-tag">{r.detachment.toUpperCase()}</span>
                </div>
                <RulesText text={r.text} index={index} />
              </div>
            ))}
          </Collapse>
        </div>
      )}
      <Collapse title={attachRules.length ? 'Leader / Support & keywords' : 'Keywords'} tone="plain">
        {top}
        {attachRules.map(({ a, from }) => (
          <div key={from + a.name} className="ability">
            <strong>{a.name}</strong>
            {all.length > 1 && <span className="muted small"> · {from}</span>}
            <RulesText text={a.characteristics?.map((c) => c.$text ?? '').join('\n') ?? ''} index={index} />
          </div>
        ))}
        <div className="small muted" style={{ marginTop: 8 }}>
          Keywords
        </div>
        <div className="kw-list">
          {keywords.map((k) => (
            <Term key={k} term={k} index={index} upper />
          ))}
        </div>
        {factionKeywords.length > 0 && (
          <>
            <div className="small muted" style={{ marginTop: 8 }}>
              Faction keywords
            </div>
            <div className="kw-list">
              {factionKeywords.map((k) => (
                <Term key={k} term={k} index={index} upper />
              ))}
            </div>
          </>
        )}
      </Collapse>
    </div>
  );
}

export { ruleText };
