import { describe, expect, it } from 'vitest';
import { open, parseMoveCode, seal, TransferError, type Parcel } from '../transfer';

const parcel: Parcel = {
  app: 'emperorslist',
  kind: 'move',
  version: 1,
  madeAt: '2026-11-26T00:00:00Z',
  backup: JSON.stringify({ app: 'emperorslist', kind: 'backup', version: 3, rosters: [{ id: 'r1', name: 'Crusade' }] }),
  dataFiles: [{ path: 'Imperium - Test.json', source: 'X/y', commit: 'abc', fetchedAt: 1, json: { big: 'x'.repeat(50_000) } }],
  dataSources: [],
  imported: [{ id: 's1', kind: 'stratagem' }],
};

describe('move parcels', () => {
  it('seal and open round-trip, compressed and encrypted', async () => {
    const { bytes, key } = await seal(parcel);
    expect(bytes.length).toBeLessThan(10_000); // 50 kB of repeated text compresses
    expect(new TextDecoder().decode(bytes)).not.toContain('Crusade');
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await open(bytes, key)).toEqual(parcel);
  });

  it('a wrong key is refused with a readable message', async () => {
    const { bytes } = await seal(parcel);
    const other = (await seal(parcel)).key;
    await expect(open(bytes, other)).rejects.toBeInstanceOf(TransferError);
    await expect(open(bytes, 'short')).rejects.toThrow(/incomplete/);
  });

  it('finds the code in a pasted link or on its own', () => {
    const key = 'A'.repeat(43);
    const id = '0123456789abcdef';
    expect(parseMoveCode(`https://new.example/move#${id}.${key}`)).toEqual({ id, key });
    expect(parseMoveCode(`  ${id}.${key} `)).toEqual({ id, key });
    expect(parseMoveCode('nope')).toBeUndefined();
  });
});
