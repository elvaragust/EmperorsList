import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '@/data/db';
import { useRosterEngine } from '@/data/gameData';
import { datasheet } from '@/engine/rules/models';
import { useFactionTheme } from '@/theme/themes';
import { DatasheetView } from '@/ui/DatasheetView';
import { Screen } from '@/ui/Screen';
import { WeaponGridView, WoundStepper } from '@/ui/WeaponGridView';
import { combinedModels } from '../roster/combined';
import { saveGame, withLog } from './games';

/** Casualty tracking for one unit (with its attached characters) during a game. */
export function GameUnitScreen() {
  const { gameId = '', unitId = '' } = useParams();
  const game = useLiveQuery(() => db.games.get(gameId), [gameId]);
  const roster = useLiveQuery(() => (game ? db.rosters.get(game.rosterId) : undefined), [game?.rosterId]);
  const { engine, index } = useRosterEngine(roster);
  useFactionTheme(game?.factionName);
  const unit = roster?.units.find((u) => u.id === unitId);
  const group = useMemo(() => (unit && roster ? [unit, ...roster.units.filter((u) => u.leaderOf === unit.id)] : []), [unit, roster]);
  const models = useMemo(() => (engine && group.length ? combinedModels(engine, group) : undefined), [engine, group]);
  if (!game || !unit || !models || !engine) return <Screen title="Unit" back>{null}</Screen>;
  const dead = Object.entries(game.casualties).flatMap(([uid, ids]) => ids.map((m) => `${uid}/${m}`));
  const toggle = (prefixed: string, alive: boolean) => {
    const [uid, ...rest] = prefixed.split('/');
    const mid = rest.join('/');
    const set = new Set(game.casualties[uid!] ?? []);
    if (alive) set.delete(mid);
    else set.add(mid);
    const name = group.find((g) => g.id === uid)?.name ?? '';
    void saveGame(withLog({ ...game, wounds: { ...game.wounds, [prefixed]: 0 }, casualties: { ...game.casualties, [uid!]: [...set] } }, `${name}: ${alive ? 'model brought back' : 'model removed'}`, 'casualty'));
  };
  const wounds = game.wounds ?? {};
  // Losing the last wound removes the model; healing a removed model brings it back.
  const setWound = (prefixed: string, lost: number, max: number) => {
    const [uid, ...rest] = prefixed.split('/');
    const mid = rest.join('/');
    const set = new Set(game.casualties[uid!] ?? []);
    const dies = lost >= max;
    if (dies) set.add(mid);
    else set.delete(mid);
    const next = { ...wounds, [prefixed]: dies ? 0 : lost };
    const name = models.loadouts.find((l) => models.models.find((m) => m.id === prefixed)?.loadoutKey === l.key)?.name ?? 'Model';
    const text = dies ? `${name}: destroyed` : `${name}: ${max - lost}/${max} wounds left`;
    void saveGame(withLog({ ...game, wounds: next, casualties: { ...game.casualties, [uid!]: [...set] } }, text, 'casualty'));
  };
  // Characters, vehicles and small units: a wound tracker per model right at the top.
  const tracked = models.models.filter((m) => !dead.includes(m.id) && (models.loadouts.find((l) => l.key === m.loadoutKey)?.wounds ?? 0) > 1);
  const showTop = tracked.length > 0 && tracked.length <= 3;
  const inst = engine.unitInst(unit.id);
  const sheet = inst ? datasheet(engine, inst) : undefined;
  return (
    <Screen title={group.map((g) => g.nickname || g.name).join(' + ')} back>
      {showTop && (
        <div className="card" style={{ padding: '8px 12px', marginBottom: 10 }}>
          {tracked.map((m) => {
            const l = models.loadouts.find((x) => x.key === m.loadoutKey)!;
            const lost = wounds[m.id] ?? 0;
            return (
              <div key={m.id} className="counter" style={{ margin: '4px 0' }}>
                <span style={{ flex: 1 }}>{l.name}</span>
                <WoundStepper left={l.wounds! - lost} max={l.wounds!} label={l.name} onChange={(left) => setWound(m.id, l.wounds! - left, l.wounds!)} />
              </div>
            );
          })}
        </div>
      )}
      <WeaponGridView loadouts={models.loadouts} models={models.models} weapons={models.weapons} dead={dead} onToggle={toggle} wounds={wounds} onWound={setWound} />
      <p className="small muted">Tap a row to see each model: − / + tracks its wounds (losing the last one removes it).</p>
      {sheet && (
        <DatasheetView
          sheet={sheet}
          weapons={[...models.weapons.values()]}
          index={index}
          attached={group.slice(1).flatMap((l) => {
            const li = engine.unitInst(l.id);
            return li ? [{ name: l.nickname || l.name, sheet: datasheet(engine, li) }] : [];
          })}
        />
      )}
    </Screen>
  );
}
