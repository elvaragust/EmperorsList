import { describe, expect, it } from 'vitest';
import { runPool } from '../pool';

describe('runPool', () => {
  it('waits for every worker and keeps going past a failure', async () => {
    const seen: number[] = [];
    let running = 0;
    let peak = 0;
    const r = await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((ok) => setTimeout(ok, n === 1 ? 1 : 5));
      running--;
      if (n === 1) throw new Error('first');
      seen.push(n);
    });
    // Nothing is still running when the pool resolves.
    expect(running).toBe(0);
    expect(peak).toBe(2);
    expect(seen.sort()).toEqual([2, 3, 4, 5]);
    expect(r.done).toBe(4);
    expect(r.errors.map((e) => (e as Error).message)).toEqual(['first']);
  });

  it('copes with nothing to do', async () => {
    expect(await runPool([], 2, async () => undefined)).toEqual({ done: 0, errors: [] });
  });
});
