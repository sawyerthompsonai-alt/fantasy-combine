import { createRng } from './rng';

export function seededShuffle<T>(items: readonly T[], seed: string, label = 'shuffle'): T[] {
  const rng = createRng(`${seed}:${label}`);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
