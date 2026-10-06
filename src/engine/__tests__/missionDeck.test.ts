import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS build script
import { deckNames, parseMissionDeck } from '../../../scripts/missions.mjs';

const HTML = `<h2>Primary Mission: Battlefield Dominance</h2><div><h3>BATTLEFIELD DOMINANCE</h3><div>Primary Mission</div>
<p>This battlefield holds great significance.</p><div>FIRST AND SECOND BATTLE ROUND</div><p><b>WHEN:</b> End of your turn.</p>
<p>You control more objectives than your opponent.<span>2VP</span></p><div>Opponent</div></div>
<h2>Secondary Mission: Assassination</h2><div>ASSASSINATION</div><div>Secondary Mission Fixed</div><div>Secondary Missions: Attacker</div>
<p>Destroy enemy characters to score points in this mission every turn.</p><h2>About</h2><p>not a card</p>`;

describe('mission deck page', () => {
  it('reads card names from the app', () => {
    const n = deckNames();
    expect(n.primary).toHaveLength(25);
    expect(n.secondary).toContain('Assassination');
  });
  it('splits the page into cards with tags', () => {
    const cards = parseMissionDeck(HTML);
    const bd = cards.find((c: { name: string }) => c.name === 'Battlefield Dominance');
    expect(bd.kind).toBe('primary');
    expect(bd.text).toContain('— 2VP');
    expect(bd.text).not.toContain('Opponent');
    const as = cards.find((c: { name: string }) => c.name === 'Assassination');
    expect(as.tags).toEqual(expect.arrayContaining(['fixed', 'attacker']));
    expect(as.text).not.toContain('not a card');
  });
});
