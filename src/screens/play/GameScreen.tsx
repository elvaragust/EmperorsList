import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db, type SavedGame } from '@/data/db';
import { listFactions, type FactionFile } from '@/data/dataPacks';
import { useRosterEngine } from '@/data/gameData';
import { nextPhase, PHASE_NAMES, PHASES, PRE_BATTLE, previousPhase, ROUNDS, totalScore, type Phase } from '@/engine/game';
import { datasheet, unitModels } from '@/engine/rules/models';
import type { RosterEngine } from '@/engine/rules/rosterEngine';
import { useFactionTheme } from '@/theme/themes';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { Stepper } from '@/ui/Stepper';
import { showToast } from '@/ui/Toast';
import { saveGame, withLog } from './games';
import { useSessionState } from '@/ui/useSessionState';
import { NotesPanel, PhasePanel, RoundBar } from './panels';
import { LiveGame } from './LiveGame';
import { keepEnded, lastActive, resumeGame } from '@/data/idle';
import { MissionFields } from './MissionFields';
import { MissionsPanel, SecondarySetup } from './secondaries';
import { OpponentUnits } from './OpponentUnits';
import { importListText } from '@/data/importList';
import { matchFaction, parseListText } from '@/engine/listText';

const SETUP_TITLES = ['Army', 'Opponent', 'Mission', 'Secondaries', 'Pre-battle'];

export function GameScreen() {
  const { gameId = '' } = useParams();
  const game = useLiveQuery(() => db.games.get(gameId), [gameId]);
  const roster = useLiveQuery(() => (game ? db.rosters.get(game.rosterId) : undefined), [game?.rosterId]);
  const { engine, index } = useRosterEngine(roster);
  useFactionTheme(game?.factionName);
  if (!game) return <Screen title="Game" back>{null}</Screen>;
  if (game.idle) return <IdleEnded game={game} />;
  if (game.live) return <LiveGame game={game} engine={engine} />;
  if (game.stage === 'setup') return <Setup game={game} engine={engine} />;
  if (game.stage === 'battle') return <Battle game={game} engine={engine} index={index} />;
  return <Result game={game} />;
}

/** The game was ended after two quiet hours: pick it back up, or keep it as finished. */
function IdleEnded({ game }: { game: SavedGame }) {
  const hours = Math.max(2, Math.floor((game.idle!.at - lastActive(game)) / 3_600_000));
  const st = game.live?.state;
  const where = game.idle!.stage === 'setup' ? 'during setup' : `in round ${st?.round ?? game.round}`;
  return (
    <Screen title="Game ended" back>
      <div className="card" style={{ padding: 16 }}>
        <p style={{ marginTop: 0 }}>
          <strong>This game was ended automatically</strong> after {hours === 2 ? 'two hours' : `${hours} hours`} with no changes, {where}.
        </p>
        <p className="muted small">
          Last change {new Date(lastActive(game)).toLocaleString()}. Nothing is lost{game.live ? ' — resuming reconnects to the live game' : ''}.
        </p>
        <button className="btn btn-primary btn-block" onClick={() => void resumeGame(game)}>
          Resume game
        </button>
        <button className="btn btn-block" style={{ marginTop: 8 }} onClick={() => void keepEnded(game)}>
          Keep it finished
        </button>
      </div>
    </Screen>
  );
}

function Setup({ game, engine }: { game: SavedGame; engine?: RosterEngine }) {
  const [factions, setFactions] = useState<FactionFile[]>([]);
  useEffect(() => {
    listFactions().then(setFactions, () => setFactions([]));
  }, []);
  const step = game.setupStep;
  const set = (patch: Partial<SavedGame>) => saveGame({ ...game, ...patch });
  const [oppStatus, setOppStatus] = useState('');
  // Read the pasted list into a roster (their faction from the picker or the list header).
  const readOpponent = async (text: string) => {
    if (!text.trim()) return set({ opponentList: '', opponentRoster: undefined });
    const parsed = parseListText(text);
    const f = factions.find((x) => x.name === game.opponentFaction) ?? matchFaction(parsed, factions);
    if (!f) {
      setOppStatus('Pick their faction above to read the list.');
      return set({ opponentList: text });
    }
    try {
      setOppStatus('Reading their list…');
      const { roster } = await importListText(parsed, f);
      await set({ opponentList: text, opponentFaction: f.name, opponentRoster: roster, opponentName: game.opponentName || '' });
      setOppStatus(`Their list: ${roster.units.length} units read — tap them in the battle's Units tab.`);
    } catch (e) {
      setOppStatus(`Couldn't read their list: ${e instanceof Error ? e.message : String(e)}`);
      void set({ opponentList: text });
    }
  };

  const checklist = useMemo(() => {
    const items: { id: string; text: string }[] = [
      { id: 'formations', text: 'Declare Battle Formations: attach Leaders, put units in Transports, choose Strategic Reserves' },
      { id: 'warlord', text: engine && engine.roster.units.some((u) => engine.isWarlord(u.id)) ? 'Warlord chosen' : 'Choose a Warlord (none set in the list)' },
    ];
    if (!engine) return items;
    const unattached = engine.roster.units.filter((u) => engine.canLead(u.id) && !u.leaderOf && engine.attachTargets(u.id).length);
    if (unattached.length) items.push({ id: 'leaders', text: `Not attached yet: ${unattached.map((u) => u.name).join(', ')}` });
    for (const u of engine.roster.units) {
      const inst = engine.unitInst(u.id);
      if (!inst) continue;
      const ds = datasheet(engine, inst);
      const hits = [
        ...ds.rules.map((r) => r.name).filter((n) => PRE_BATTLE.test(n)),
        ...ds.abilities.filter((a) => a.name !== 'Leader' && PRE_BATTLE.test(a.characteristics?.map((c) => c.$text).join(' ') ?? '')).map((a) => a.name),
      ];
      if (hits.length) items.push({ id: `u-${u.id}`, text: `${u.nickname || u.name}: ${[...new Set(hits)].join(', ')}` });
    }
    items.push({ id: 'roll', text: 'Roll off for attacker/defender and first turn' });
    return items;
  }, [engine]);

  return (
    <Screen title={`New game · ${SETUP_TITLES[step]}`} back>
      <div className="wizard-steps" aria-hidden="true">
        {SETUP_TITLES.map((t, i) => (
          <span key={t} className={i <= step ? 'done' : undefined} />
        ))}
      </div>
      <p className="muted small">Your army: {game.rosterName}</p>

      {step === 1 && (
        <>
          <label className="field">
            <span>Opponent's name</span>
            <input className="input" defaultValue={game.opponentName} onBlur={(e) => set({ opponentName: e.target.value })} />
          </label>
          <label className="field">
            <span>Their faction</span>
            <select className="input" value={game.opponentFaction ?? ''} onChange={(e) => set({ opponentFaction: e.target.value })}>
              <option value="">Unknown</option>
              {factions.map((f) => (
                <option key={f.path} value={f.name}>
                  {f.group} · {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Their list (optional — paste their text export to look at their units during the game)</span>
            <textarea className="input" defaultValue={game.opponentList ?? ''} onBlur={(e) => void readOpponent(e.target.value)} />
          </label>
          {oppStatus && <p className="small muted">{oppStatus}</p>}
          {!oppStatus && game.opponentRoster && <p className="small muted">Their list: {game.opponentRoster.units.length} units read.</p>}
        </>
      )}

      {step === 2 && (
        <>
          <MissionFields value={{ mission: game.mission, deployment: game.deployment, twist: game.twist, disposition: game.disposition }} onChange={(v) => set(v)} disposition={engine?.roster.forceDisposition} />
          <div className="section-label">Attacker or Defender?</div>
          <p className="small muted" style={{ marginTop: 0 }}>Roll off after the deployment card: the winner decides.</p>
          <div className="seg" role="radiogroup">
            {(['attacker', 'defender'] as const).map((r) => (
              <button key={r} role="radio" aria-checked={game.role === r} className={game.role === r ? 'on' : undefined} onClick={() => set({ role: r })}>
                {r === 'attacker' ? 'I am the Attacker' : 'I am the Defender'}
              </button>
            ))}
          </div>
          <div className="section-label">Who goes first?</div>
          <div className="card">
            {(['me', 'them'] as const).map((s) => (
              <button key={s} className="choice" role="radio" aria-checked={game.firstTurn === s} onClick={() => set({ firstTurn: s, turn: s })}>
                <span className="mark" />
                <span>{s === 'me' ? 'I go first' : `${game.opponentName || 'Opponent'} goes first`}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 3 && <SecondarySetup game={game} set={set} />}

      {step === 4 && (
        <div className="card">
          {checklist.map((c) => (
            <button key={c.id} className="choice" role="checkbox" aria-checked={Boolean(game.checklist?.[c.id])} onClick={() => set({ checklist: { ...game.checklist, [c.id]: !game.checklist?.[c.id] } })}>
              <span className="mark square" />
              <span style={{ flex: 1 }}>{c.text}</span>
            </button>
          ))}
        </div>
      )}

      <div className="sticky-bar">
        {step > 1 && (
          <button className="btn" onClick={() => set({ setupStep: step - 1 })}>
            Back
          </button>
        )}
        {step < 4 ? (
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => set({ setupStep: step + 1 })}>
            Next
          </button>
        ) : (
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={() => {
              const first = game.firstTurn ?? 'me';
              const g = withLog({ ...game, stage: 'battle', round: 1, turn: first, phase: 'command', firstTurn: first, cp: { me: 1, them: 1 } }, 'Battle started · both players gain 1 CP', 'phase');
              void saveGame(g);
            }}
          >
            Start battle
          </button>
        )}
      </div>
    </Screen>
  );
}

function Battle({ game, engine }: { game: SavedGame; engine?: RosterEngine; index?: RosterEngine['index'] }) {
  const navigate = useNavigate();
  const [tab, setTab] = useSessionState<'phase' | 'missions' | 'units' | 'score' | 'log'>(`battle-tab:${game.id}`, 'phase');
  const [ending, setEnding] = useState(false);
  const [note, setNote] = useState('');
  const first = game.firstTurn ?? 'me';
  const save = (g: SavedGame) => saveGame(g);
  const who = (s: 'me' | 'them') => (s === 'me' ? 'You' : game.opponentName || 'Opponent');

  const advance = () => {
    const n = nextPhase(game, first);
    if (n.gameOver) return setEnding(true);
    let g: SavedGame = { ...game, round: n.round, turn: n.turn, phase: n.phase };
    if (n.cpGain) g = withLog({ ...g, cp: { me: g.cp.me + 1, them: g.cp.them + 1 } }, `Round ${n.round}, ${who(n.turn)}: Command phase · both gain 1 CP`, 'cp');
    void save(g);
  };
  const back = () => {
    const p = previousPhase(game, first);
    void save({ ...game, ...p });
  };

  const setVp = (side: 'me' | 'them', kind: 'primary' | 'secondary', round: number, v: number) => {
    const sc = { ...game.vp[side], [kind]: game.vp[side][kind].map((x, i) => (i === round ? v : x)) };
    void save({ ...game, vp: { ...game.vp, [side]: sc } });
  };

  const unitsLeft = useMemo(() => {
    if (!engine) return [];
    return engine.roster.units
      .filter((u) => !u.leaderOf)
      .map((u) => {
        const group = [u, ...engine.roster.units.filter((x) => x.leaderOf === u.id)];
        let total = 0;
        let dead = 0;
        for (const m of group) {
          const n = unitModels(engine, m.id).models.length;
          total += n;
          dead += Math.min(n, game.casualties[m.id]?.length ?? 0);
        }
        return { u, group, total, dead };
      });
  }, [engine, game.casualties]);

  return (
    <Screen
      title={`Round ${game.round}`}
      back
      actions={
        <button className="btn btn-sm btn-ghost" onClick={() => setEnding(true)}>
          End
        </button>
      }
    >
      <RoundBar round={game.round} onPick={(r) => void save(withLog({ ...game, round: r, turn: first, phase: 'command' }, `Moved to round ${r}`, 'phase'))} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontWeight: 600 }}>{game.turn === 'me' ? 'Your turn' : `${who('them')}'s turn`}</span>
        <span className="spacer" />
        <span className="num">
          VP {totalScore(game.vp.me)}–{totalScore(game.vp.them)}
        </span>
      </div>
      <div className="filters" style={{ marginTop: 6 }}>
        {PHASES.map((p) => (
          <button key={p} className={`filter ${game.phase === p ? 'on' : ''}`} onClick={() => save({ ...game, phase: p })}>
            {PHASE_NAMES[p]}
          </button>
        ))}
      </div>
      <div className="card" style={{ padding: 12 }}>
        <div className="counter">
          <span>Your CP</span>
          <Stepper value={game.cp.me} onChange={(v) => save(withLog({ ...game, cp: { ...game.cp, me: v } }, `Your CP → ${v}`, 'cp'))} label="your CP" />
        </div>
        <div className="counter" style={{ marginTop: 8 }}>
          <span>{who('them')} CP</span>
          <Stepper value={game.cp.them} onChange={(v) => save({ ...game, cp: { ...game.cp, them: v } })} label="opponent CP" />
        </div>
      </div>
      <div className="btn-row">
        <button className="btn" onClick={back}>
          ‹
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={advance}>
          Next: {nextLabel(game, first, who)}
        </button>
      </div>

      <NotesPanel gameId={game.id} notes={game.notes} />

      <div className="seg" role="tablist">
        {(['phase', 'missions', 'units', 'score', 'log'] as const).map((t) => (
          <button key={t} className={tab === t ? 'on' : undefined} onClick={() => setTab(t)}>
            {t === 'phase' ? PHASE_NAMES[game.phase] : t === 'missions' ? 'Missions' : t === 'units' ? 'Units' : t === 'score' ? 'Score' : 'Log'}
          </button>
        ))}
      </div>

      {tab === 'phase' && (
        <PhasePanel
          engine={engine}
          phase={game.phase}
          myTurn={game.turn === 'me'}
          onSpend={(st, cost) => {
            const again = game.used.some((u) => u.id === st.id && u.round === game.round && u.phase === game.phase && u.turn === game.turn);
            let g: SavedGame = { ...game, cp: { ...game.cp, me: Math.max(0, game.cp.me - cost) }, used: [...game.used, { round: game.round, turn: game.turn, phase: game.phase, id: st.id, name: st.name }] };
            g = withLog(g, `Used ${st.name} (${cost} CP)${again ? ' — already used this phase!' : ''}`, 'stratagem');
            void save(g);
          }}
        />
      )}

      {tab === 'missions' && (
        <MissionsPanel
          game={game}
          round={game.round}
          turnKey={`${game.round}-${game.turn}`}
          myCommandPhase={game.turn === 'me' && game.phase === 'command'}
          primary={game.mission}
          onChange={(p) => void save({ ...game, ...p })}
          onCp={(d, why) => void db.games.get(game.id).then((g) => g && save(withLog({ ...g, cp: { ...g.cp, me: Math.max(0, g.cp.me + d) } }, `${why} (${d > 0 ? '+' : ''}${d} CP)`, 'cp')))}
          onVp={(kind, vp, why) =>
            void db.games.get(game.id).then((g) => {
              if (!g) return;
              const i = Math.min(g.round, g.vp.me[kind].length) - 1;
              const sc = { ...g.vp.me, [kind]: g.vp.me[kind].map((x, k) => (k === i ? x + vp : x)) };
              void save(withLog({ ...g, vp: { ...g.vp, me: sc } }, `${why}: +${vp} VP (${kind}, round ${g.round})`, 'vp'));
              showToast(`+${vp} VP added to round ${g.round}`);
            })
          }
        />
      )}

      {tab === 'units' && game.opponentRoster && (
        <>
          <div className="section-label">{who('them')}'s units</div>
          <OpponentUnits game={game} playerId="local" />
          <div className="section-label">Your units</div>
        </>
      )}
      {tab === 'units' && (
        <div className="card">
          {unitsLeft.map(({ u, group, total, dead }) => (
            <Link key={u.id} className="unit-row" to={`/play/${game.id}/unit/${u.id}`}>
              <span style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, textDecoration: dead >= total ? 'line-through' : undefined }}>{group.map((x) => x.nickname || x.name).join(' + ')}</div>
                <div className="muted small">
                  {total - dead}/{total} models
                </div>
              </span>
            </Link>
          ))}
        </div>
      )}

      {tab === 'score' && (
        <div className="card" style={{ padding: 12 }}>
          {(['me', 'them'] as const).map((side) => (
            <div key={side} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {who(side)} · {totalScore(game.vp[side])} VP
              </div>
              <div className="score-grid">
                <span />
                {Array.from({ length: ROUNDS }, (_, i) => (
                  <span key={i} className="small muted">
                    R{i + 1}
                  </span>
                ))}
                <span />
                {(['primary', 'secondary'] as const).map((kind) => (
                  <ScoreRow key={kind} label={kind === 'primary' ? 'Pri' : 'Sec'} values={game.vp[side][kind]} onChange={(r, v) => setVp(side, kind, r, v)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'log' && (
        <>
          <div className="btn-row">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" style={{ flex: 1 }} />
            <button className="btn btn-sm" disabled={!note.trim()} onClick={() => (save(withLog(game, note.trim(), 'note')), setNote(''))}>
              Add
            </button>
          </div>
          <div className="card">
            {[...game.log].reverse().map((l, i) => (
              <div key={i} className="row small">
                <span className="muted" style={{ width: 54 }}>
                  R{l.round} {l.phase ? PHASE_NAMES[l.phase as Phase].slice(0, 3) : ''}
                </span>
                <span style={{ flex: 1 }}>{l.text}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <Sheet open={ending} onClose={() => setEnding(false)} title="End the game?">
        <p>
          Final score {totalScore(game.vp.me)}–{totalScore(game.vp.them)}.
        </p>
        <button
          className="btn btn-primary btn-block"
          onClick={() => {
            const me = totalScore(game.vp.me);
            const them = totalScore(game.vp.them);
            const result = me > them ? 'win' : me < them ? 'loss' : 'draw';
            void save(withLog({ ...game, stage: 'done', finishedAt: Date.now(), result }, `Game over: ${me}–${them}`, 'note')).then(() => setEnding(false));
          }}
        >
          Finish and save
        </button>
        <button className="btn btn-ghost btn-block" onClick={() => navigate('/play')}>
          Keep playing later
        </button>
      </Sheet>
    </Screen>
  );
}

function nextLabel(game: SavedGame, first: 'me' | 'them', who: (s: 'me' | 'them') => string): string {
  const n = nextPhase(game, first);
  if (n.gameOver) return 'end of game';
  if (n.turn !== game.turn) return `${who(n.turn)}${n.turn === 'me' ? 'r' : "'s"} turn`;
  return PHASE_NAMES[n.phase];
}

export function ScoreRow({ label, values, onChange, readOnly }: { label: string; values: number[]; onChange: (round: number, v: number) => void; readOnly?: boolean }) {
  return (
    <>
      <span className="small">{label}</span>
      {values.map((v, i) =>
        readOnly ? (
          <span key={i} className="num" style={{ padding: '8px 0' }}>
            {v || '–'}
          </span>
        ) : (
          <input key={i} type="number" inputMode="numeric" min={0} value={v || ''} placeholder="0" onChange={(e) => onChange(i, Math.max(0, Number(e.target.value) || 0))} aria-label={`${label} round ${i + 1}`} />
        ),
      )}
      <span className="num small">{values.reduce((a, b) => a + b, 0)}</span>
    </>
  );
}

function Result({ game }: { game: SavedGame }) {
  const navigate = useNavigate();
  return (
    <Screen title="Result" back>
      <div className="big-num" style={{ textAlign: 'center', margin: '12px 0' }}>
        {totalScore(game.vp.me)} – {totalScore(game.vp.them)}
      </div>
      <p style={{ textAlign: 'center' }} className="tag">
        {(game.result ?? 'draw').toUpperCase()} vs {game.opponentName || 'opponent'}
        {game.opponentFaction ? ` (${game.opponentFaction})` : ''}
      </p>
      <p className="small muted" style={{ textAlign: 'center' }}>
        {game.rosterName} · {game.mission || 'mission not set'} · {new Date(game.startedAt).toLocaleDateString()}
      </p>
      <div className="section-label">Result</div>
      <div className="card">
        {(['win', 'loss', 'draw'] as const).map((r) => (
          <button key={r} className="choice" role="radio" aria-checked={game.result === r} onClick={() => saveGame({ ...game, result: r })}>
            <span className="mark" />
            <span>{r[0]!.toUpperCase() + r.slice(1)}</span>
          </button>
        ))}
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea className="input" defaultValue={game.notes ?? ''} onBlur={(e) => saveGame({ ...game, notes: e.target.value })} />
      </label>
      <div className="section-label">Log</div>
      <div className="card">
        {game.log.map((l, i) => (
          <div key={i} className="row small">
            <span className="muted" style={{ width: 30 }}>
              R{l.round}
            </span>
            <span style={{ flex: 1 }}>{l.text}</span>
          </div>
        ))}
      </div>
      <div className="btn-row">
        <button className="btn" onClick={() => saveGame({ ...game, stage: 'battle' })}>
          Reopen game
        </button>
        <button className="btn btn-ghost btn-danger" onClick={() => db.games.delete(game.id).then(() => navigate('/play', { replace: true }))}>
          Delete game
        </button>
      </div>
    </Screen>
  );
}
