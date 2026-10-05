import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db } from '@/data/db';
import { rootsFor, useIndex } from '@/data/gameData';
import { catalogueChain } from '@/engine/bsdata/index';
import { configChoices } from '@/engine/rules/config';
import { ruleText } from '@/engine/rules/nodes';
import { ENH, RosterEngine } from '@/engine/rules/rosterEngine';
import { stratagemsFor } from '@/engine/wahapedia';
import { blankRoster } from '@/search/buildDocs';
import { useFactionTheme } from '@/theme/themes';
import { RuleLabel } from '@/ui/RuleLabel';
import { RulesText } from '@/ui/RulesText';
import { Screen } from '@/ui/Screen';

/** A faction at a glance: army rules, detachments (rules, enhancements, stratagems) and datasheets. */
export function FactionScreen() {
  const { catalogueId = '' } = useParams();
  const { index, error } = useIndex(catalogueId);
  const imported = useLiveQuery(() => db.imported.toArray(), []);
  const [open, setOpen] = useState<string | null>(null);
  const cat = index?.catalogues.get(catalogueId);
  useFactionTheme(cat?.name);

  const data = useMemo(() => {
    if (!index) return undefined;
    const engine = new RosterEngine(index, blankRoster(catalogueId), rootsFor(index, catalogueId));
    // Army rules: non-core rules that many of this faction's datasheets point at (e.g. Oath of Moment),
    // plus the faction catalogue's own shared rules. Rules from imported allies drop out this way.
    const units = engine.unitChoices();
    const linked = new Map<string, number>();
    for (const u of units) {
      for (const l of u.root.node.infoLinks) if (l.type === 'rule') linked.set(l.targetId, (linked.get(l.targetId) ?? 0) + 1);
    }
    const gst = index.gameSystem?.id;
    const chain = catalogueChain(index, catalogueId);
    const own = new Set((chain[0]?.sharedRules ?? []).map((r) => r.id));
    // Catalogue-level rule links are the army rules; a sub-faction may inherit them from its parent.
    const catLinks = (chain[0]?.infoLinks?.length ? chain[0].infoLinks : chain[0]?.catalogueLinks?.map((l) => index.catalogues.get(l.targetId)).find((c) => c?.infoLinks?.length)?.infoLinks) ?? [];
    const linkedArmy = new Set(catLinks.filter((l) => l.type === 'rule').map((l) => l.targetId));
    const candidates = [...index.rules.values()].filter((r) => ruleText(r) && index.origin.get(r.id) !== gst);
    const maxN = Math.max(0, ...candidates.map((r) => linked.get(r.id) ?? 0));
    const armyRules = candidates.filter((r) => {
      const n = linked.get(r.id) ?? 0;
      return linkedArmy.has(r.id) || (own.has(r.id) && n > 0) || (n >= 3 && n >= maxN * 0.3);
    });
    const detachments = configChoices(engine).detachments.filter((d) => !d.hidden);
    const enhancementsByDet = new Map<string, { name: string; text: string; pts?: number }[]>();
    const parentOf = new Map<string, (typeof index.entries extends Map<string, infer V> ? V : never)>();
    for (const g of index.entries.values()) if (!g.type) g.selectionEntries?.forEach((x) => parentOf.set(x.id, g));
    for (const e of index.entries.values()) {
      if (!e.costs?.some((c) => c.typeId === ENH && c.value > 0)) continue;
      // Enhancement visibility is keyed on the detachment id in its hidden modifiers.
      const json = JSON.stringify(e.modifiers ?? []);
      const parentGroup = parentOf.get(e.id);
      const groupJson = JSON.stringify(parentGroup?.modifiers ?? []);
      for (const d of detachments) {
        if (json.includes(d.key) || groupJson.includes(d.key) || parentGroup?.name === `${d.name} Enhancements`) {
          const list = enhancementsByDet.get(d.key) ?? [];
          list.push({
            name: e.name,
            text: e.profiles?.map((p) => p.characteristics?.map((c) => c.$text ?? '').join('\n')).join('\n') ?? '',
            pts: e.costs.find((c) => c.typeId === '51b2-306e-1021-d207')?.value,
          });
          enhancementsByDet.set(d.key, list);
        }
      }
    }
    return { engine, armyRules, detachments, enhancementsByDet, units };
  }, [index, catalogueId]);

  const title = (cat?.name ?? 'Faction').replace(/^(Imperium|Chaos|Xenos|Aeldari) - (Adeptus Astartes - )?/, '');
  if (error) return <Screen title={title} back><p className="muted">{error}</p></Screen>;
  if (!data) return <Screen title={title} back><p className="muted">Loading…</p></Screen>;

  return (
    <Screen title={title} back>
      {data.armyRules.length > 0 && (
        <>
          <div className="section-label">Army rules</div>
          {data.armyRules.map((r) => (
            <div className="card" key={r.id} style={{ marginBottom: 6 }}>
              <button className="choice" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <span style={{ flex: 1, fontWeight: 600 }}>{r.name}</span>
                <RuleLabel kind="army" />
              </button>
              {open === r.id && (
                <div style={{ padding: '0 14px 12px' }}>
                  <RulesText text={ruleText(r)} index={index} />
                </div>
              )}
            </div>
          ))}
        </>
      )}
      <div className="section-label">Detachments</div>
      {data.detachments.map((d) => {
        const strats = imported ? stratagemsFor(imported, [d.name], []).filter((s) => s.detachment) : [];
        const enh = data.enhancementsByDet.get(d.key) ?? [];
        return (
          <div className="card" key={d.key} style={{ marginBottom: 6 }}>
            <button className="choice" onClick={() => setOpen(open === d.key ? null : d.key)} aria-expanded={open === d.key}>
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{d.name}</div>
                <div className="muted small">
                  {d.dp} DP{d.dispositions.length ? ` · ${d.dispositions.join(', ')}` : ''}
                </div>
              </span>
              <RuleLabel kind="detachment" />
            </button>
            {open === d.key && (
              <div style={{ padding: '0 14px 12px' }}>
                {d.rules.map((r) => (
                  <div key={r.name}>
                    <strong>{r.name}</strong>
                    <RulesText text={r.text} index={index} />
                  </div>
                ))}
                {enh.length > 0 && <div className="section-label">Enhancements</div>}
                {enh.map((e) => (
                  <div key={e.name} style={{ marginBottom: 8 }}>
                    <strong>{e.name}</strong> {e.pts ? <span className="muted small">{e.pts} pts</span> : null}
                    <RulesText text={e.text} index={index} />
                  </div>
                ))}
                {strats.length > 0 && <div className="section-label">Stratagems · Wahapedia</div>}
                {strats.map((s) => (
                  <div key={s.id} style={{ marginBottom: 8 }}>
                    <strong>{s.name}</strong> <span className="muted small">{[s.cp ? `${s.cp}CP` : '', s.type, s.phase].filter(Boolean).join(' · ')}</span>
                    <RulesText text={s.text} index={index} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="section-label">Datasheets · {data.units.length}</div>
      <div className="card">
        {data.units.map((u) => (
          <Link key={u.root.key} className="choice" to={`/reference/unit/${catalogueId}/${u.root.key}`}>
            <span style={{ flex: 1 }}>{u.name}</span>
            <span className="num muted">{u.points}</span>
          </Link>
        ))}
      </div>
    </Screen>
  );
}
