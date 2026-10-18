export function streamKey(subsystem: string, date: string): string {
  return JSON.stringify([subsystem, date]);
}
export function deriveStream(seed: number, subsystem: string, date: string): number {
  let hash = 2166136261;
  for (const char of JSON.stringify([seed, subsystem, date]).split('')) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  return hash || 0x9e3779b9;
}
export function nextUint32(state: number): { value: number; state: number } {
  if (!Number.isInteger(state) || state <= 0 || state > 0xffffffff) throw new Error('Invalid RNG state');
  let x = state;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  const next = x >>> 0;
  return { value: next, state: next };
}
export function randomInt(state: number, bound: number): { value: number; state: number } {
  if (!Number.isInteger(bound) || bound < 1 || bound > 0x100000000) throw new Error('Invalid RNG bound');
  const limit = 0x100000000 - (0x100000000 % bound);
  let draw = nextUint32(state);
  while (draw.value >= limit) draw = nextUint32(draw.state);
  return { value: draw.value % bound, state: draw.state };
}
