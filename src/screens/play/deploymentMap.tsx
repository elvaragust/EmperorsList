/**
 * Simple drawings of where each deployment card puts the two deployment
 * zones on a 60" × 44" battlefield — a hint only, our own sketch (not the
 * card), so check the card for the exact shapes and the objective markers.
 */
type Shape = { pts: string } | { rect: [number, number, number, number] };
interface Layout {
  attacker: Shape[];
  defender: Shape[];
  note: string;
}

const W = 60;
const H = 44;
const r = (x: number, y: number, w: number, h: number): Shape => ({ rect: [x, y, w, h] });
const p = (...xy: number[]): Shape => ({ pts: xy.join(' ') });

const LAYOUTS: Record<string, Layout> = {
  'Dawn of War': { attacker: [r(0, 0, W, 10)], defender: [r(0, H - 10, W, 10)], note: 'Long battlefield edges, strips along each edge.' },
  'Hammer and Anvil': { attacker: [r(0, 0, 18, H)], defender: [r(W - 18, 0, 18, H)], note: 'Short battlefield edges, deep strips along each end.' },
  'Search and Destroy': {
    attacker: [p(0, 0, 30, 0, 30, 13, 21, 22, 0, 22)],
    defender: [p(W, H, 30, H, 30, 31, 39, 22, W, 22)],
    note: 'Opposite table quarters, kept away from the centre.',
  },
  'Sweeping Engagement': {
    attacker: [p(0, 0, W, 0, W, 8, 30, 8, 30, 14, 0, 14)],
    defender: [p(0, H, W, H, W, H - 14, 30, H - 14, 30, H - 8, 0, H - 8)],
    note: 'Long edges, each zone stepped — deeper on one half.',
  },
  'Crucible of Battle': { attacker: [p(0, 0, 30, 0, 0, H)], defender: [p(W, H, 30, H, W, 0)], note: 'Triangles from opposite corners, split on the diagonal.' },
  'Tipping Point': {
    attacker: [p(0, 0, 12, 0, 12, 22, 20, 22, 20, H, 0, H)],
    defender: [p(W, H, W - 12, H, W - 12, 22, W - 20, 22, W - 20, 0, W, 0)],
    note: 'Short edges, each zone stepped — offset toward opposite ends.',
  },
};

function draw(s: Shape, fill: string, key: number) {
  return 'rect' in s ? <rect key={key} x={s.rect[0]} y={s.rect[1]} width={s.rect[2]} height={s.rect[3]} fill={fill} /> : <polygon key={key} points={s.pts} fill={fill} />;
}

export function DeploymentMap({ name }: { name?: string }) {
  const l = name ? LAYOUTS[name] : undefined;
  if (!l) return null;
  return (
    <figure className="deploy-map" aria-label={`${name} deployment layout hint`}>
      <svg viewBox={`-1 -1 ${W + 2} ${H + 2}`} role="img">
        <rect x={0} y={0} width={W} height={H} className="deploy-board" />
        {l.attacker.map((s, i) => draw(s, 'var(--deploy-attacker)', i))}
        {l.defender.map((s, i) => draw(s, 'var(--deploy-defender)', i + 10))}
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} className="deploy-mid" />
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} className="deploy-mid" />
        <circle cx={W / 2} cy={H / 2} r={0.8} className="deploy-centre" />
      </svg>
      <figcaption className="small muted">
        <span className="swatch att" /> Attacker <span className="swatch def" /> Defender · {l.note} Rough sketch — check the card for exact distances and objectives.
      </figcaption>
    </figure>
  );
}
