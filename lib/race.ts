export function finishTimesMs(ranking: number[], runDurationMs: number): Record<number, number> {
  const k = ranking.length;
  return Object.fromEntries(
    ranking.map((athlete, i) => [
      athlete,
      runDurationMs * (0.6 + (k <= 1 ? 0 : 0.35 * (i / (k - 1)))),
    ]),
  );
}
