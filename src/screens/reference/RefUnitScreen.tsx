import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { rootsFor, useIndex } from '@/data/gameData';
import { newUnit } from '@/engine/rules/edit';
import { datasheet, unitModels } from '@/engine/rules/models';
import { offeredEntries } from '@/engine/rules/nodes';
import { RosterEngine } from '@/engine/rules/rosterEngine';
import { blankRoster } from '@/search/buildDocs';
import { useFactionTheme } from '@/theme/themes';
import { DatasheetView } from '@/ui/DatasheetView';
import { Screen } from '@/ui/Screen';
import { WeaponGridView } from '@/ui/WeaponGridView';

/** Read-only datasheet from the reference, built on the default loadout. */
export function RefUnitScreen() {
  const { catalogueId = '', key = '' } = useParams();
  const { index, error } = useIndex(catalogueId);
  const cat = index?.catalogues.get(catalogueId);
  useFactionTheme(cat?.name);
  const data = useMemo(() => {
    if (!index) return undefined;
    const roots = rootsFor(index, catalogueId);
    const base = blankRoster(catalogueId);
    const e0 = new RosterEngine(index, base, roots);
    const unit = newUnit(e0, key);
    const engine = new RosterEngine(index, { ...base, units: [unit] }, roots);
    const inst = engine.unitInst(unit.id)!;
    const options = inst.node ? [...new Set(offeredEntries(index, inst.node).filter((o) => o.node.type !== 'model').map((o) => o.node.name))] : [];
    return { engine, unit, sheet: datasheet(engine, inst), models: unitModels(engine, unit.id), points: engine.unitPoints(unit.id), options };
  }, [index, catalogueId, key]);
  if (error) return <Screen title="Datasheet" back><p className="muted">{error}</p></Screen>;
  if (!data) return <Screen title="Datasheet" back><p className="muted">Loading…</p></Screen>;
  return (
    <Screen title={data.sheet.name} back>
      <div className="muted small">{data.points} pts with the default loadout</div>
      <div className="section-label">Default models</div>
      <WeaponGridView loadouts={data.models.loadouts} models={data.models.models} weapons={data.models.weapons} dead={[]} />
      <DatasheetView sheet={data.sheet} weapons={[...data.models.weapons.values()]} index={index} />
    </Screen>
  );
}
