export const SCALE = 1_000_000;
export function roundDiv(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error('Fixed-point division needs safe integers and a positive denominator');
  }
  const magnitude = Math.abs(numerator);
  const quotient = Math.floor(magnitude / denominator);
  const remainder = magnitude % denominator;
  const result = quotient + (remainder >= denominator - remainder ? 1 : 0);
  return numerator < 0 ? -result : result;
}
export function fixedMultiply(a: number, b: number): number { return roundDiv(a * b, SCALE); }
// Q6 exponential: range reduction /16, 12 Taylor terms, then four squarings.
// Supported domain [-8, 8]. Fixed rounding at every operation, no native exp/log/pow.
export function fixedExp(x: number): number {
  if (!Number.isSafeInteger(x) || Math.abs(x) > 8 * SCALE) throw new Error('Fixed exp domain is [-8, 8]');
  if (x < 0) return roundDiv(SCALE * SCALE, fixedExp(-x));
  const reduced = roundDiv(x, 16);
  let term = SCALE;
  let result = SCALE;
  for (let i = 1; i <= 12; i++) {
    term = roundDiv(term * reduced, SCALE * i);
    result += term;
  }
  for (let i = 0; i < 4; i++) result = fixedMultiply(result, result);
  return result;
}
