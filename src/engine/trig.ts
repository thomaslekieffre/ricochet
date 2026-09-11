/**
 * Fixed-point sine / cosine via a FROZEN lookup table.
 *
 * The table lives in `trig-table.ts` as a base64-encoded Int32Array constant,
 * generated once by `scripts/gen-trig-table.mjs`. It is byte-identical on every
 * machine — no Math.sin at runtime — so the solver is deterministic across hosts
 * (the requirement for authoritative multiplayer, docs/PHASES.md P3).
 *
 * An aim angle becomes a table index; only that index travels in an Order.
 */

import { SIN_TABLE, TABLE_BITS, TABLE_SIZE } from "./trig-table";

export { TABLE_BITS, TABLE_SIZE };
const MASK = TABLE_SIZE - 1;
const QUARTER = TABLE_SIZE >> 2;

export const sinIdx = (idx: number): number => SIN_TABLE[idx & MASK]!;
export const cosIdx = (idx: number): number => SIN_TABLE[(idx + QUARTER) & MASK]!;

/** Quantise a radian angle (from mouse input) to a table index. Input-side only. */
export const angleToIdx = (radians: number): number => {
  const t = radians / (Math.PI * 2);
  return Math.round(t * TABLE_SIZE) & MASK;
};

export const idxToRadians = (idx: number): number =>
  ((idx & MASK) / TABLE_SIZE) * Math.PI * 2;
