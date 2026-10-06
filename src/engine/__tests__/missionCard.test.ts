import { describe, expect, it } from 'vitest';
import { parseCard, roundsOf, scoreItems, sectionsFor } from '../missionCard';

const BD = `This battlefield holds great significance for the wider war effort.
FIRST AND SECOND BATTLE ROUND
**WHEN:** End of your turn.
You control more **objectives** than your opponent. — 2VP
SECOND BATTLE ROUND ONWARDS
**WHEN:** End of your Command phase (or the end of your turn in the fifth battle round).
For each **objective** you control. — 3VP
+For each of those **objectives** (excluding your **home objective**) if you control your **home objective**. — +2VP · CUMULATIVE`;

describe('mission card parsing', () => {
  it('reads round ranges', () => {
    expect(roundsOf('FIRST AND SECOND BATTLE ROUND')).toEqual({ from: 1, to: 2 });
    expect(roundsOf('SECOND BATTLE ROUND ONWARDS')).toEqual({ from: 2, to: 5 });
    expect(roundsOf('ANY BATTLE ROUND')).toEqual({ from: 1, to: 5 });
  });
  it('splits a primary into round sections with scoring lines', () => {
    const c = parseCard(BD);
    expect(c.intro[0]).toContain('significance');
    expect(c.sections).toHaveLength(2);
    expect(sectionsFor(c, 1).map((s) => s.title)).toEqual(['FIRST AND SECOND BATTLE ROUND']);
    expect(sectionsFor(c, 3).map((s) => s.title)).toEqual(['SECOND BATTLE ROUND ONWARDS']);
    const s2 = c.sections[1]!;
    expect(s2.when).toContain('Command phase');
    expect(s2.items.map((i) => [i.vp, i.each, Boolean(i.bonus)])).toEqual([
      [3, true, false],
      [2, true, true],
    ]);
    expect(c.sections[0]!.items[0]).toMatchObject({ vp: 2, each: false });
  });
  it('applies caps', () => {
    const c = parseCard('Show no mercy.\nANY BATTLE ROUND\n**WHEN:** End of a turn.\nFor each enemy unit **destroyed** this turn. — 2VP(UP TO 5VP)');
    const it0 = c.sections[0]!.items[0]!;
    expect(it0.cap).toBe(5);
    expect(scoreItems([it0], [4])).toBe(5);
    expect(scoreItems([it0], [2])).toBe(4);
  });
});
