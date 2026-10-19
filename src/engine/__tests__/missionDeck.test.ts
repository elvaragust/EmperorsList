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

describe('cards whose action has the same name', () => {
  it('keeps the whole card (Plunder) and drops run-together labels', () => {
    const html =
      '<h2>Secondary Mission: Plunder</h2><div>PLUNDER</div><div>Secondary MissionSecondary Missions: AttackerSecondary Missions: Defender</div><p>Unguarded prizes lie strewn across the field of battle.</p><p><b>WHEN DRAWN:</b> If the Cleanse Secondary Mission is active for you, draw a new card.</p><div>PLUNDER</div><p><b>STARTS:</b> Your Shooting phase.</p><div>ANY BATTLE ROUND</div><p><b>WHEN:</b> End of your turn.</p><p>A terrain area was plundered this turn.<span>5VP</span></p>';
    const p = parseMissionDeck(html).find((c: { name: string }) => c.name === 'Plunder');
    expect(p.text).not.toMatch(/Secondary Missions:/);
    expect(p.text).toContain('STARTS');
    expect(p.text).toContain('— 5VP');
    expect(p.tags).toEqual(expect.arrayContaining(['attacker', 'defender']));
  });
});

describe('card edges', () => {
  it('keeps the Mirrored World table, spaces out OR, and stops before quoted core rules', () => {
    const html = `<div class="ca7Name">MIRRORED WORLD</div><p>As destinies converge, rival warlords find themselves on parallel paths.</p>
<div>Roll a D6 and consult the table below.</div><div class="caPmBlock"><div class="caPmScore"><span><span class="tt">Battlefield</span> <span class="tt">Dominance</span></span><span class="caPmVP"><div class="cruD1"></div></span></div><div class="caPmScore"><span>(Roll again)</span><span class="caPmVP"><div class="cruD6"></div></span></div></div>
<div class="ca7Name">CLEANSE</div><p>Your forces have identified a series of tainted objectives in this area.</p><div>ANY BATTLE ROUND</div>
<div class="caPmScore"><span>One objective was cleansed.</span><span class="caPmVP">2VP</span></div><div class="caPmScore"><span class="caPmOr">OR</span><span>Two or more objectives were cleansed.</span><span class="caPmVP">5VP</span></div>
<div class="tooltip_templates"><span><div class="tooltip_header">06.01 Visibility</div><p>Line of sight is used to determine visibility between models.</p></span></div>`;
    const cards = parseMissionDeck(html);
    const mw = cards.find((c: { name: string }) => c.name === 'Mirrored World');
    expect(mw.text).toContain('1: Battlefield Dominance');
    expect(mw.text).toContain('6: (Roll again)');
    // The table row didn't start a Battlefield Dominance card.
    expect(cards.find((c: { name: string }) => c.name === 'Battlefield Dominance')).toBeUndefined();
    const cl = cards.find((c: { name: string }) => c.name === 'Cleanse');
    expect(cl.text).toContain('OR Two or more objectives');
    expect(cl.text).not.toContain('Visibility');
  });
});
