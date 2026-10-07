import type { DataIndex } from '@/engine/bsdata/index';
import type { RawProfile } from '@/engine/bsdata/raw';
import type { Datasheet } from '@/engine/rules/models';
import { ruleText } from '@/engine/rules/nodes';
import type { WeaponProfile } from '@/engine/types';
import type { ReactNode } from 'react';
import { Collapse } from './Collapse';
import { RulesText, Term } from './RulesText';

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

export function WeaponTable({ weapons, index, melee }: { weapons: WeaponProfile[]; index?: DataIndex; melee: boolean }) {
  if (!weapons.length) return null;
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
        {weapons.map((w) => (
          <tr key={w.id}>
            <td>
              {w.name}
              {w.keywords.length > 0 && (
                <div className="wkw">
                  {w.keywords.map((k, i) => (
                    <span key={k}>
                      {i > 0 && ', '}
                      <Term term={k} index={index} />
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
        ))}
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
          <div key={a.id + a.name} style={{ padding: '10px 0', borderTop: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <strong>{a.name}</strong>
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
  for (const { name, profile } of profiles) {
    const chars = profile.characteristics ?? [];
    const ordered = STAT_ORDER.map((k) => chars.find((c) => c.name.toUpperCase() === k)).filter(Boolean);
    const list = (ordered.length >= 4 ? ordered : chars.slice(0, 6)).map((c) => ({ k: c!.name.toUpperCase(), v: c!.$text ?? '' }));
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
}: {
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
      <StatTable profiles={profiles} />
      {showWeapons && (
        <>
          <WeaponTable weapons={weapons.filter((w) => !w.melee)} index={index} melee={false} />
          <div style={{ height: 8 }} />
          <WeaponTable weapons={weapons.filter((w) => w.melee)} index={index} melee />
        </>
      )}
      <div className="section-label">Abilities</div>
      {rules.length > 0 && (
        <div className="kw-list" style={{ margin: '4px 0 6px' }}>
          {rules.map((r) => (
            <Term key={r.name} term={r.name} index={index} />
          ))}
        </div>
      )}
      {abilities.map(({ a, from }) => {
        const text = a.characteristics?.map((c) => c.$text ?? '').join('\n') ?? '';
        const buffs = from && /while this model is leading|this model's unit|the unit this model is leading|models in this model's unit|bodyguard/i.test(text);
        return (
          <div key={(from ?? '') + a.id + a.name} className="ability">
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong>{a.name}</strong>
              {from && <span className="tag from-tag">{from.toUpperCase()}</span>}
              {buffs && <span className="tag">BUFFS THE UNIT</span>}
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
