/**
 * Run `fn` over `items` with `n` workers at once. One item failing doesn't
 * stop the others; this resolves only when every worker has stopped, with
 * how many items worked and every error (in the order they happened).
 */
export async function runPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<{ done: number; errors: unknown[] }> {
  let i = 0;
  let done = 0;
  const errors: unknown[] = [];
  const worker = async () => {
    while (i < items.length) {
      const item = items[i++]!;
      try {
        await fn(item);
        done++;
      } catch (e) {
        errors.push(e);
      }
    }
  };
  await Promise.allSettled(Array.from({ length: n }, worker));
  return { done, errors };
}
