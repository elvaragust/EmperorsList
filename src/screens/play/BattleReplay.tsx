import { useEffect, useMemo, useRef, useState } from 'react';
import type { SavedGame } from '@/data/db';
import type { Score } from '@/engine/game';
import { Icon } from '@/ui/Icon';
import type { ResultSide } from './ResultView';

/** Share of starting wounds left at the end of round r (1 = untouched), carried forward through rounds with no record. */
function healthAt(list: (number | null)[] | undefined, r: number): number | undefined {
  if (!list || list.every((x) => x == null)) return undefined;
  if (r <= 0) return 1;
  for (let i = r - 1; i >= 0; i--) if (list[i] != null) return list[i]!;
  return 1;
}

const COLORS = ['var(--side-me)', 'var(--side-them)', 'var(--side-third)'];
/** One second per battle round. */
const MS_PER_ROUND = 1000;

type Line = { key: string; name: string; color: string; dashed: boolean; vp: number[]; per: number[]; health?: number[] };

/** A tiny line chart: one value per round (index 0 = before the battle), drawn up to `t` rounds. */
function FlowChart({ lines, value, max, t, rounds, played, title, unit, onPick }: { lines: Line[]; value: (l: Line) => number[] | undefined; max: number; t: number; rounds: number; /** Rounds actually played (the axis always shows all five). */ played: number; title: string; unit: string; onPick: (r: number) => void }) {
  const W = 320;
  const H = 120;
  const pad = { l: 30, r: 10, t: 10, b: 20 };
  const x = (r: number) => pad.l + (r / rounds) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  // The line so far: every finished round, then a point part-way to the next one.
  const path = (vals: number[]) => {
    const pts: string[] = [];
    const whole = Math.floor(t);
    for (let r = 0; r <= Math.min(whole, played); r++) pts.push(`${x(r)},${y(vals[r]!)}`);
    if (t < played && t > whole) {
      const a = vals[whole]!;
      const b = vals[whole + 1]!;
      const f = t - whole;
      pts.push(`${x(t)},${y(a + (b - a) * f)}`);
    }
    return pts.join(' ');
  };
  return (
    <div className="flow-chart">
      <div className="flow-title small">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, round by round`} onClick={(e) => {
        const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const r = Math.round(((e.clientX - box.left) / box.width * W - pad.l) / (W - pad.l - pad.r) * rounds);
        onPick(Math.max(1, Math.min(played, r)));
      }}>
        {/* Recessive grid: the baseline and the top value only. */}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="flow-axis" />
        <line x1={pad.l} x2={W - pad.r} y1={y(max)} y2={y(max)} className="flow-grid" />
        <text x={pad.l - 6} y={y(max) + 4} className="flow-tick" textAnchor="end">
          {max}
          {unit}
        </text>
        <text x={pad.l - 6} y={y(0) + 4} className="flow-tick" textAnchor="end">
          0
        </text>
        {Array.from({ length: rounds + 1 }, (_, r) => (
          <text key={r} x={x(r)} y={H - 4} className={`flow-tick ${Math.ceil(t) === r && r > 0 ? 'on' : ''} ${r > played ? 'unplayed' : ''}`} textAnchor="middle">
            {r === 0 ? 'Start' : `R${r}`}
          </text>
        ))}
        <line x1={x(t)} x2={x(t)} y1={pad.t - 4} y2={y(0)} className="flow-cursor" />
        {lines.map((l) => {
          const vals = value(l);
          if (!vals) return null;
          return (
            <g key={l.key} style={{ color: l.color }}>
              <polyline points={path(vals)} className={`flow-line ${l.dashed ? 'dashed' : ''}`} />
              {vals.slice(1, Math.floor(t) + 1).map((v, i) => (
                <circle key={i} cx={x(i + 1)} cy={y(v)} r={4} className="flow-dot" />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * The battle replayed round after round: the running VP total and how much of
 * each army is left (as a share of its own starting wounds, so armies of any
 * size compare) flow from the start to the last round. Plays by itself the
 * first time it's on screen; pause, replay or tap a round to stop there.
 */
export function BattleReplay({ sides, health, rounds: playedIn }: { sides: (ResultSide & { shown: Score })[]; health?: SavedGame['health']; rounds: number }) {
  // The axis always runs over the five battle rounds; the lines stop at the last one played.
  const AXIS = 5;
  const rounds = Math.max(1, Math.min(AXIS, playedIn));
  const lines = useMemo<Line[]>(
    () =>
      [...sides]
        .sort((a, b) => Number(b.isMe) - Number(a.isMe))
        .slice(0, 3)
        .map((s, i) => {
          const per = Array.from({ length: rounds }, (_, r) => (s.shown.primary[r] ?? 0) + (s.shown.secondary[r] ?? 0));
          const vp = [0];
          per.forEach((v) => vp.push(vp[vp.length - 1]! + v));
          const list = health?.[s.key];
          const h = healthAt(list, 1) === undefined ? undefined : Array.from({ length: rounds + 1 }, (_, r) => Math.round((healthAt(list, r) ?? 1) * 100));
          return { key: s.key, name: s.name, color: COLORS[i]!, dashed: i === 2, vp, per, health: h };
        }),
    [sides, health, rounds],
  );
  const vpMax = Math.max(10, ...lines.map((l) => l.vp[l.vp.length - 1]!));
  const niceVp = Math.ceil(vpMax / 10) * 10;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [t, setT] = useState(reduce ? rounds : 0);
  const [playing, setPlaying] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // Start playing the first time the replay scrolls into view.
  useEffect(() => {
    if (reduce || !box.current || typeof IntersectionObserver === 'undefined') {
      setT(rounds);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !started.current) {
        started.current = true;
        setT(0);
        setPlaying(true);
      }
    }, { threshold: 0.4 });
    io.observe(box.current);
    return () => io.disconnect();
  }, [reduce, rounds]);

  useEffect(() => {
    if (!playing) return;
    // A ~30 fps timer: smooth enough for a few seconds of replay, and it runs wherever the page is shown.
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setT((v) => Math.min(rounds, v + dt / MS_PER_ROUND));
    }, 33);
    return () => clearInterval(id);
  }, [playing, rounds]);
  useEffect(() => {
    if (playing && t >= rounds) setPlaying(false);
  }, [playing, t, rounds]);

  const round = Math.max(1, Math.min(rounds, Math.ceil(t - 1e-6) || 1));
  const pick = (r: number) => {
    setPlaying(false);
    setT(r);
  };
  const anyHealth = lines.some((l) => l.health);
  const me = lines[0]!;
  return (
    <>
      <div className="section-label">Round by round replay</div>
      <div className="card replay" ref={box}>
        <div className="replay-legend small">
          {lines.map((l) => (
            <span key={l.key}>
              <svg width="18" height="10" aria-hidden="true" style={{ color: l.color }}>
                <line x1="1" x2="17" y1="5" y2="5" className={`flow-line ${l.dashed ? 'dashed' : ''}`} />
              </svg>
              {l.name}
            </span>
          ))}
        </div>
        <FlowChart lines={lines} value={(l) => l.vp} max={niceVp} t={t} rounds={AXIS} played={rounds} title="Victory points, running total" unit="" onPick={pick} />
        {anyHealth && <FlowChart lines={lines} value={(l) => l.health} max={100} t={t} rounds={AXIS} played={rounds} title="Army left (share of its starting wounds)" unit="%" onPick={pick} />}

        <div className="replay-readout" aria-live="polite">
          <div className="replay-round">Round {round}</div>
          {lines.map((l) => {
            const lost = l.health ? l.health[round - 1]! - l.health[round]! : undefined;
            return (
              <div key={l.key} className="replay-side">
                <span className="replay-key" style={{ background: l.color }} aria-hidden="true" />
                <span className="replay-name">{l.name}</span>
                <span className="num">+{l.per[round - 1]} VP</span>
                <span className="muted small">({l.vp[round]} total)</span>
                {l.health && (
                  <span className="small">
                    {l.health[round]}% left{lost ? ` · lost ${lost}%` : ''}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="replay-controls">
          <button className="btn btn-sm" onClick={() => (t >= rounds ? (setT(0), setPlaying(true)) : setPlaying(!playing))} aria-label={playing ? 'Pause' : t >= rounds ? 'Replay' : 'Play'}>
            <Icon name={playing ? 'pause' : 'play'} size={16} />
            {playing ? 'Pause' : t >= rounds ? 'Replay' : 'Play'}
          </button>
          <div className="replay-rounds" role="group" aria-label="Go to a round">
            {Array.from({ length: AXIS }, (_, i) => (
              <button key={i} className={`filter ${!playing && round === i + 1 && t > 0 ? 'on' : ''}`} onClick={() => pick(i + 1)} disabled={i + 1 > rounds} title={i + 1 > rounds ? 'Not played' : undefined}>
                R{i + 1}
              </button>
            ))}
          </div>
        </div>
        {!lines.slice(1).some((l) => l.health) && me.health && <p className="small muted replay-note">Only your army's losses are known in a game on one phone.</p>}
        {!anyHealth && <p className="small muted replay-note">Army losses weren't recorded for this game (games from before this update, or with no units tracked).</p>}
      </div>
    </>
  );
}
