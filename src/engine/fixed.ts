/**
 * Q16.16 fixed-point arithmetic.
 *
 * A "fixed" value is a plain JS number that holds an integer (exact up to 2^53).
 * Every multiply / divide / sqrt routes through BigInt, so a computation gives
 * a bit-identical result on every machine and every JS engine. That is the
 * whole point: the physics solver must be reproducible for replays, spectating
 * and server-side audit (see docs/ricochet-playbook.html §07).
 */

export const SHIFT = 16n;
export const ONE = 65536; // 1 << 16
export const HALF = 32768;

export const fromInt = (n: number): number => n * ONE;
export const fromFloat = (f: number): number => Math.round(f * ONE);
export const toFloat = (x: number): number => x / ONE;

/** a * b in fixed-point (BigInt intermediate, truncates toward zero). */
export const mul = (a: number, b: number): number =>
  Number((BigInt(a) * BigInt(b)) >> SHIFT);

/** a / b in fixed-point (BigInt intermediate, truncates toward zero). */
export const div = (a: number, b: number): number =>
  Number((BigInt(a) << SHIFT) / BigInt(b));

/** sqrt of a fixed-point value, result in fixed-point. Integer Newton on BigInt. */
export const sqrt = (x: number): number => {
  if (x <= 0) return 0;
  const n = BigInt(x) << SHIFT; // sqrt(x/ONE)*ONE === sqrt(x*ONE)
  let r = n;
  let s = (n >> 1n) + 1n;
  while (s < r) {
    r = s;
    s = (n / s + s) >> 1n;
  }
  return Number(r);
};

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x;

export const abs = (x: number): number => (x < 0 ? -x : x);
