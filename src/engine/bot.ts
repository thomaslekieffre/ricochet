/**
 * Greedy 1-ply bot. Enumerates candidate orders for the acting side, simulates
 * each against "opponent holds", scores the resulting state and takes the best.
 *
 * Not part of the deterministic contract — only the Order it returns is logged
 * and replayed. It is nonetheless seeded so tests are stable.
 */

import * as fx from "./fixed";
import { HEROES } from "./heroes";
import { resolve } from "./solver";
import { TABLE_SIZE } from "./trig";
import type { GameState, Order } from "./types";

export type BotLevel = 1 | 2 | 3;

const HOLD: Order = { bodyId: -1, angleIdx: 0, power: 0, ability: false, hold: true };

function seeded(seed: number): () => number {
  let x = (seed >>> 0) || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

function distToZone(s: GameState, x: number, y: number): number {
  const z = s.arena.zone;
  return Math.hypot(fx.toFloat(x - z.x), fx.toFloat(y - z.y));
}

function evaluate(s: GameState, me: 0 | 1): number {
  const foe = (me ^ 1) as 0 | 1;
  let score = (s.hold[me] - s.hold[foe]) * 1000;
  if (s.over) score += s.winner === me ? 100000 : -100000;

  let mineIn = 0;
  let foeIn = 0;
  const zr = fx.toFloat(s.arena.zone.r);
  for (const b of s.bodies) {
    const d = distToZone(s, b.x, b.y);
    const inside = b.alive && d <= zr;
    if (b.owner === me) {
      if (!b.alive) score -= 400;
      else score -= d * 0.5;
      if (inside) mineIn++;
    } else {
      if (!b.alive) score += 350;
      else score += d * 0.35;
      if (inside) foeIn++;
    }
  }
  score += (mineIn - foeIn) * 300;
  score += s.teams[me].momentum * 20;
  return score;
}

export function pickOrder(state: GameState, me: 0 | 1, level: BotLevel = 2): Order {
  const rnd = seeded(state.turn * 2654435761 + me * 40503);
  const dirs = level === 1 ? 5 : level === 2 ? 8 : 12;
  const powers = level === 3 ? [fx.fromFloat(0.55), fx.ONE] : [fx.ONE];
  const noise = level === 1 ? 900 : level === 2 ? 250 : 60;
  const asA = me === 0;

  const mine = state.bodies.filter((b) => b.owner === me && b.alive);
  if (mine.length === 0) return { ...HOLD };

  let best: Order = { ...HOLD };
  let bestScore = -Infinity;

  const run = (order: Order) => {
    const res = asA ? resolve(state, order, HOLD) : resolve(state, HOLD, order);
    const sc = evaluate(res.state, me) + (rnd() * 2 - 1) * noise;
    if (sc > bestScore) {
      bestScore = sc;
      best = order;
    }
  };

  run({ ...HOLD });
  for (const b of mine) {
    const def = HEROES[b.hero];
    const abilityOpts =
      level >= 2 && state.teams[me].momentum >= def.abilityCost
        ? [false, true]
        : [false];
    for (let d = 0; d < dirs; d++) {
      const angleIdx = Math.round((d / dirs) * TABLE_SIZE) % TABLE_SIZE;
      for (const power of powers) {
        for (const ability of abilityOpts) {
          run({ bodyId: b.id, angleIdx, power, ability });
        }
      }
    }
  }
  return best;
}
