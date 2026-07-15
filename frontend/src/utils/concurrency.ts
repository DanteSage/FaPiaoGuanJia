export async function pMap<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = 3
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function pull(): Promise<void> {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }

  const runners: Promise<void>[] = [];
  for (let i = 0; i < limit; i += 1) {
    runners.push(pull());
  }
  await Promise.all(runners);
  return results;
}
