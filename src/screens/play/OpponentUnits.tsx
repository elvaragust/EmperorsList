import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { db, type SavedGame } from '@/data/db';
import { useRosterEngine } from '@/data/gameData';
import type { UnitSummary } from '@/engine/live';
import { datasheet } from '@/engine/rules/models';
import { fromPayload } from '@/engine/share';
import type { Roster } from '@/engine/types';
import { DatasheetView } from '@/ui/DatasheetView';
import { Screen } from '@/ui/Screen';
import { WeaponGridView } from '@/ui/WeaponGridView';
import { combinedModels } from '../roster/combined';
import { unitsLeft } from './panels';

/** Another player's army: shared in a live game, or read from the list pasted at setup. */
export function opponentRosterOf(game: SavedGame | undefined, playerId: string): Roster | undefined {
  if (!game) return undefined;
  if (playerId === 'local') return game.opponentRoster;
  const p = game.live?.state?.players.find((x) => x.id === playerId);
  if (!p?.list) return undefined;
  let n = 0;
  return fromPayload(p.list, () => `${playerId}-${n++}`);
}

/** Their units with models left (from what they share), each opening a read-only view. */
export function OpponentUnits({ game, playerId, summary }: { game: SavedGame; playerId: string; summary?: UnitSummary[] }) {
  const listKey = playerId === 'local' ? game.opponentRoster?.id : JSON.stringify(game.live?.state?.players.find((x) => x.id === playerId)?.list?.u ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const roster = useMemo(() => opponentRosterOf(game, playerId), [listKey, playerId]);
  const { engine, error } = useRosterEngine(roster);
  const units = useMemo(() => (engine ? unitsLeft(engine, {}) : []), [engine]);
  if (!roster) return null;
  if (error) return <p className="small muted">Their faction isn't downloaded on this phone ({error}).</p>;
  return (
    <div className="card">
      {units.map((u, i) => {
        const s = summary?.find((x) => x.name === u.name) ?? summary?.[i];
        const alive = s ? s.alive : u.total;
        return (
          <Link key={u.id} className="unit-row" to={`/play/${game.id}/opp/${playerId}/${i}`}>
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, textDecoration: alive <= 0 ? 'line-through' : undefined }}>{u.name}</div>
              <div className="muted small">
                {alive}/{u.total} models{s || playerId === 'local' ? '' : ' (no casualty info yet)'}
              </div>
            </span>
            <span className="muted small">VIEW</span>
          </Link>
        );
      })}
      {!engine && <div className="row muted small">Loading their army…</div>}
    </div>
  );
}

/** Read-only datasheet and shots grid of an opponent's (or teammate's) unit. */
export function OpponentUnitScreen() {
  const { gameId = '', playerId = '', idx = '0' } = useParams();
  const game = useLiveQuery(() => db.games.get(gameId), [gameId]);
  const listKey = playerId === 'local' ? game?.opponentRoster?.id : JSON.stringify(game?.live?.state?.players.find((x) => x.id === playerId)?.list?.u ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const roster = useMemo(() => opponentRosterOf(game, playerId), [listKey, playerId]);
  const { engine, index } = useRosterEngine(roster);
  const left = useMemo(() => (engine ? unitsLeft(engine, {}) : []), [engine]);
  const target = left[Number(idx)];
  const group = useMemo(() => (engine && target ? [engine.roster.units.find((u) => u.id === target.id)!, ...engine.roster.units.filter((u) => u.leaderOf === target.id)] : []), [engine, target]);
  const models = useMemo(() => (engine && group.length ? combinedModels(engine, group) : undefined), [engine, group]);
  if (!game || !engine || !target || !models) return <Screen title="Unit" back>{!roster ? <p className="muted">Their list isn't available.</p> : <p className="muted">Loading…</p>}</Screen>;
  const summary = playerId === 'local' ? undefined : game.live?.state?.units[playerId];
  const s = summary?.find((x) => x.name === target.name) ?? summary?.[Number(idx)];
  const owner = playerId === 'local' ? game.opponentName || 'Opponent' : game.live?.state?.players.find((x) => x.id === playerId)?.name ?? 'Opponent';
  return (
    <Screen title={target.name} back>
      <p className="small muted" style={{ marginTop: 0 }}>
        {owner}'s unit · read only{s ? ` · ${s.alive}/${s.total} models left` : ''}
      </p>
      <WeaponGridView loadouts={models.loadouts} models={models.models} weapons={models.weapons} dead={[]} />
      {group.map((u) => {
        const inst = engine.unitInst(u.id);
        const sheet = inst ? datasheet(engine, inst) : undefined;
        return sheet ? (
          <div key={u.id}>
            {group.length > 1 && <div className="section-label">{u.name}</div>}
            <DatasheetView sheet={sheet} weapons={[...models.weapons.values()]} index={index} />
          </div>
        ) : null;
      })}
    </Screen>
  );
}
