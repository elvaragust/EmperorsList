import { describe, expect, it } from 'vitest';
import { BackupError, itemsToWrite, parseBackup, planRestore, summarize, summaryText, type DeviceItems } from '../backupMerge';

const roster = (id: string, updatedAt: number, name = id) => ({ id, name, updatedAt, createdAt: 1, config: [], detachmentIds: [], units: [] });
const game = (id: string, lastActiveAt: number) => ({ id, rosterId: 'r', stage: 'done', startedAt: 1, lastActiveAt });
const file = (o: Record<string, unknown>) => JSON.stringify({ app: 'emperorslist', kind: 'backup', version: 3, ...o });
const device = (o: Partial<Record<keyof DeviceItems, unknown[]>>): DeviceItems => {
  const m = (items: unknown[] = [], key = 'id') => new Map(items.map((i) => [(i as Record<string, string>)[key]!, i]));
  return { rosters: m(o.rosters), games: m(o.games), collection: m(o.collection, 'entryId'), layouts: m(o.layouts), pins: m(o.pins) };
};

describe('parseBackup', () => {
  it('rejects files that are not backups, with a plain message', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"hello":1}')).toThrow('not an EmperorsList backup');
    expect(() => parseBackup(JSON.stringify({ app: 'emperorslist', kind: 'list' }))).toThrow('not a backup');
    expect(() => parseBackup(file({ version: 99, rosters: [roster('a', 1)] }))).toThrow('newer version');
    expect(() => parseBackup(file({ rosters: 'x' }))).toThrow('damaged');
    expect(() => parseBackup(file({ rosters: [] }))).toThrow('empty');
  });

  it('ignores Wahapedia rows, practice games and broken entries; fills old roster fields', () => {
    const d = parseBackup(file({ rosters: [{ id: 'a', name: 'A', updatedAt: 2 }, { name: 'no id' }, 5], games: [game('g', 1), { ...game('p', 1), practice: true }], imported: [{ id: 'w' }] }));
    expect(d.rosters).toHaveLength(1);
    expect(d.rosters[0]!.config).toEqual([]);
    expect(d.rosters[0]!.detachmentIds).toEqual([]);
    expect(d.games.map((g) => g.id)).toEqual(['g']);
    expect(d.skipped).toBe(2);
    expect('imported' in d).toBe(false);
  });

  it('reads old backups without a version, layouts or pins', () => {
    const d = parseBackup(JSON.stringify({ app: 'emperorslist', rosters: [roster('a', 1)] }));
    expect(d.version).toBe(1);
    expect(d.layouts).toEqual([]);
    expect(d.pins).toEqual([]);
  });
});

describe('planRestore', () => {
  const data = parseBackup(
    file({
      rosters: [roster('new', 5), roster('newer', 20), roster('older', 5), roster('same', 7)],
      games: [game('g1', 100), game('g2', 50)],
      collection: [{ entryId: 'c1', owned: 3 }, { entryId: 'c2', owned: 1 }],
      pins: [{ id: 'p1', name: 'P' }],
      layouts: [{ id: 'l1', name: 'L', createdAt: 1 }],
    }),
  );
  const here = device({
    rosters: [roster('newer', 10), roster('older', 10), roster('same', 7), roster('mine', 1)],
    games: [game('g1', 90), game('g2', 60)],
    collection: [{ entryId: 'c1', owned: 2 }],
    pins: [{ id: 'p1', name: 'P' }],
  });
  const plan = planRestore(data, here);

  it('counts new, newer and older items per kind', () => {
    expect(plan.counts.rosters).toEqual({ new: 1, newer: 1, older: 1, same: 1, differs: 0 });
    expect(plan.counts.games).toMatchObject({ newer: 1, older: 1 });
    expect(plan.counts.collection).toMatchObject({ new: 1, differs: 1 });
    expect(plan.counts.pins).toMatchObject({ same: 1 });
    expect(plan.counts.layouts).toMatchObject({ new: 1 });
  });

  it('keeps the newer copy by default', () => {
    expect(itemsToWrite(plan, 'rosters', 'newer').map((r) => r.id)).toEqual(['new', 'newer']);
    expect(itemsToWrite(plan, 'games', 'newer').map((g) => g.id)).toEqual(['g1']);
    expect(itemsToWrite(plan, 'collection', 'newer').map((c) => c.entryId)).toEqual(['c2']);
    expect(itemsToWrite(plan, 'pins', 'newer')).toEqual([]);
  });

  it('can take the backup copy of everything', () => {
    expect(itemsToWrite(plan, 'rosters', 'replace').map((r) => r.id)).toEqual(['new', 'newer', 'older']);
    expect(itemsToWrite(plan, 'games', 'replace').map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(itemsToWrite(plan, 'collection', 'replace').map((c) => c.entryId)).toEqual(['c1', 'c2']);
  });

  it('summarizes what happened, including pins and layouts', () => {
    const s = summarize(plan, 'newer');
    expect(s.added).toMatchObject({ rosters: 1, layouts: 1, collection: 1 });
    expect(s.updated).toMatchObject({ rosters: 1, games: 1 });
    expect(s.kept).toMatchObject({ rosters: 2, games: 1, collection: 1, pins: 1 });
    const text = summaryText(s);
    expect(text).toContain('Added 1 list, 1 collection entry, 1 layout.');
    expect(text).toContain('Updated 1 list, 1 game from the backup.');
    expect(text).toContain("Kept this device's copy of 2 lists, 1 game, 1 collection entry, 1 pin.");
    expect(summarize(plan, 'replace').updated).toMatchObject({ rosters: 2, games: 2, collection: 1 });
  });
});
