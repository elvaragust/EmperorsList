import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '@/data/db';
import { useRosterEngine } from '@/data/gameData';
import { datasheet } from '@/engine/rules/models';
import { useFactionTheme } from '@/theme/themes';
import { AbilityList, DatasheetView } from '@/ui/DatasheetView';
import { Screen } from '@/ui/Screen';
import { WeaponGridView } from '@/ui/WeaponGridView';
import { combinedModels, leaderBuffTag } from '../roster/combined';
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
    void saveGame(withLog({ ...game, casualties: { ...game.casualties, [uid!]: [...set] } }, `${name}: ${alive ? 'model brought back' : 'model removed'}`, 'casualty'));
  };
  const inst = engine.unitInst(unit.id);
  const sheet = inst ? datasheet(engine, inst) : undefined;
  return (
    <Screen title={group.map((g) => g.nickname || g.name).join(' + ')} back>
      <WeaponGridView loadouts={models.loadouts} models={models.models} weapons={models.weapons} dead={dead} onToggle={toggle} />
      {group.slice(1).map((l) => {
        const li = engine.unitInst(l.id);
        const ds = li ? datasheet(engine, li) : undefined;
        return ds ? (
          <div key={l.id}>
            <div className="section-label">From {l.name}</div>
            <AbilityList abilities={ds.abilities.filter((a) => a.name !== 'Leader')} index={index} highlight={leaderBuffTag} />
          </div>
        ) : null;
      })}
      {sheet && <DatasheetView sheet={sheet} weapons={[...models.weapons.values()]} index={index} />}
    </Screen>
  );
}
