import { describe, expect, it } from 'vitest';
import { applySecOp, type SecondaryState } from '../missions';
import { linkName } from '../rules/nodes';
import type { RawLink } from '../bsdata/raw';

const tactical = (active: string[], deck: string[]): SecondaryState => ({ mode: 'tactical', fixed: [], tactical: { deck, active, scored: [], discarded: [] } });

describe('secondary missions in battle', () => {
  it('a drawn card put back goes into the deck, never on top', () => {
    const s = applySecOp(tactical(['Cleanse'], ['Beacon', 'Plunder']), { op: 'putBack', name: 'Cleanse', at: 1 });
    expect(s.tactical).toMatchObject({ active: [], deck: ['Beacon', 'Cleanse', 'Plunder'] });
  });

  it('a scored Tactical part is kept with its ticks, leaves the hand, and comes back when undone', () => {
    let s = tactical(['Cleanse', 'Beacon'], []);
    s = applySecOp(s, { op: 'secPart', name: 'Cleanse', round: 2, done: true, part: 'turn', vp: 4, counts: { 0: [1] } });
    expect(s.tactical?.active).toEqual(['Beacon']);
    expect(s.tactical?.scored).toEqual([{ name: 'Cleanse', round: 2 }]);
    expect(s.secParts).toEqual([{ name: 'Cleanse', round: 2, part: 'turn', vp: 4, counts: { 0: [1] } }]);
    // A double tap (or a second phone) scores it once.
    expect(applySecOp(s, { op: 'secPart', name: 'Cleanse', round: 2, done: true, part: 'turn', vp: 4 })).toBe(s);
    s = applySecOp(s, { op: 'secPart', name: 'Cleanse', round: 2, done: false, part: 'turn' });
    expect(s.secParts).toEqual([]);
    expect(s.tactical?.active).toEqual(['Beacon', 'Cleanse']);
    expect(s.tactical?.scored).toEqual([]);
  });

  it('a Tactical card that left the hand cannot be scored', () => {
    const s = applySecOp(tactical(['Beacon'], []), { op: 'discard', name: 'Beacon' });
    expect(applySecOp(s, { op: 'secPart', name: 'Beacon', round: 1, done: true, part: 'turn', vp: 3 })).toBe(s);
  });

  it('a Fixed card is scored part by part in any round', () => {
    let s: SecondaryState = { mode: 'fixed', fixed: ['Assassination', 'Bring It Down'] };
    s = applySecOp(s, { op: 'secPart', name: 'Assassination', round: 1, done: true, part: 'anyTurn@1-me', vp: 5 });
    s = applySecOp(s, { op: 'secPart', name: 'Assassination', round: 3, done: true, part: 'anyTurn@3-me', vp: 3 });
    expect(s.secParts?.map((p) => `${p.round}:${p.vp}`)).toEqual(['1:5', '3:3']);
    s = applySecOp(s, { op: 'secPart', name: 'Assassination', round: 1, done: false, part: 'anyTurn@1-me' });
    expect(s.secParts?.map((p) => p.round)).toEqual([3]);
  });
});

describe('secondaries score as you tick', () => {
  it('sets a part to what is ticked, checks the VP it had, and unticking takes it back to the hand', () => {
    let s = tactical(['Cleanse'], []);
    const set = (vp: number, n: number, prev: number) => applySecOp(s, { op: 'secSet', name: 'Cleanse', round: 1, part: 'turn', vp, counts: { 0: n ? [n] : [] }, prev });
    s = set(2, 1, 0);
    expect(s.secParts).toEqual([{ name: 'Cleanse', round: 1, part: 'turn', vp: 2, counts: { 0: [1] } }]);
    expect(s.tactical?.active).toEqual([]);
    // Another phone changed it meanwhile: the stale change is refused (so its VP isn't counted either).
    expect(set(4, 2, 0)).toBe(s);
    s = set(4, 2, 2);
    expect(s.secParts?.[0]).toMatchObject({ vp: 4, counts: { 0: [2] } });
    s = set(0, 0, 4);
    expect(s.secParts).toEqual([]);
    expect(s.tactical?.active).toEqual(['Cleanse']);
  });
});

describe('rule names on links', () => {
  const link = (extra: Partial<RawLink>): RawLink => ({ id: 'l', name: 'Deadly Demise', targetId: 'r', type: 'rule', ...extra });
  it('applies an unconditional name append ("Deadly Demise" + "D6")', () => {
    expect(linkName(link({ modifiers: [{ field: 'name', type: 'append', value: 'D6' }] }))).toBe('Deadly Demise D6');
    expect(linkName(link({ modifiers: [{ field: 'name', type: 'append', value: 1 }] }))).toBe('Deadly Demise 1');
  });
  it('leaves conditional modifiers alone', () => {
    expect(linkName(link({ modifiers: [{ field: 'name', type: 'append', value: 'D6', conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'self', childId: 'x' } as never] }] }))).toBe('Deadly Demise');
  });
});
