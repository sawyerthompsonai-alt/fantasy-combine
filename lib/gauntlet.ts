export function eliminationBatches(n: number): number[] {
  if (!Number.isInteger(n) || n < 2 || n > 20) {
    throw new Error('manager count must be an integer between 2 and 20');
  }
  const r = n - 2;
  const p = Math.min(11, r);
  if (p === 0) return [];
  const base = Math.floor(r / p);
  const extra = r % p;
  return Array.from({ length: p }, (_, i) => base + (i < extra ? 1 : 0));
}
