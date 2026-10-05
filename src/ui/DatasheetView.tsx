import type { DataIndex } from '@/engine/bsdata/index';
import type { RawProfile } from '@/engine/bsdata/raw';
import type { Datasheet } from '@/engine/rules/models';
import { ruleText } from '@/engine/rules/nodes';
import type { WeaponProfile } from '@/engine/types';
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

export function DatasheetView({ sheet, weapons, index }: { sheet: Datasheet; weapons: WeaponProfile[]; index?: DataIndex }) {
  return (
    <div>
      {sheet.stats.map((p) => (
        <StatLine key={p.id + p.name} profile={p} />
      ))}
      <div className="section-label">Weapons</div>
      <WeaponTable weapons={weapons.filter((w) => !w.melee)} index={index} melee={false} />
      <div style={{ height: 8 }} />
      <WeaponTable weapons={weapons.filter((w) => w.melee)} index={index} melee />
      {sheet.rules.length > 0 && (
        <>
          <div className="section-label">Core and army rules</div>
          <div className="kw-list">
            {sheet.rules.map((r) => (
              <Term key={r.name} term={r.name} index={index} />
            ))}
          </div>
        </>
      )}
      {sheet.abilities.length > 0 && (
        <>
          <div className="section-label">Abilities</div>
          <AbilityList abilities={sheet.abilities} index={index} />
        </>
      )}
      {sheet.other.map((p) => (
        <div key={p.id} style={{ marginTop: 10 }}>
          <div className="section-label">{p.typeName}</div>
          <strong>{p.name}</strong>
          <RulesText text={p.characteristics?.map((c) => `${c.name}: ${c.$text ?? ''}`).join('\n') ?? ''} index={index} />
        </div>
      ))}
      <div className="section-label">Keywords</div>
      <div className="kw-list">
        {sheet.keywords.map((k) => (
          <Term key={k} term={k} index={index} upper />
        ))}
      </div>
      {sheet.factionKeywords.length > 0 && (
        <>
          <div className="section-label">Faction keywords</div>
          <div className="kw-list">
            {sheet.factionKeywords.map((k) => (
              <Term key={k} term={k} index={index} upper />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export { ruleText };
