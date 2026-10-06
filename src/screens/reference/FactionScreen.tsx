import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { rootsFor, useIndex } from '@/data/gameData';
import { catalogueChain } from '@/engine/bsdata/index';
import { configChoices, enhancementsByDetachment } from '@/engine/rules/config';
import { ruleText } from '@/engine/rules/nodes';
import { RosterEngine } from '@/engine/rules/rosterEngine';
import { blankRoster } from '@/search/buildDocs';
import { useFactionTheme } from '@/theme/themes';
import { RuleLabel } from '@/ui/RuleLabel';
import { DetachmentCard } from '@/ui/DetachmentCard';
import { RulesText } from '@/ui/RulesText';
import { Screen } from '@/ui/Screen';

/** A faction at a glance: army rules, detachments (rules, enhancements, stratagems) and datasheets. */
export function FactionScreen() {
  const { catalogueId = '' } = useParams();
  const { index, error } = useIndex(catalogueId);
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
    const enhancementsByDet = enhancementsByDetachment(index, detachments);
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
      <div className="card" style={{ overflow: 'hidden' }}>
        {data.detachments.map((d) => (
          <DetachmentCard key={d.key} d={d} enhancements={data.enhancementsByDet.get(d.key) ?? []} index={index} />
        ))}
      </div>
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
