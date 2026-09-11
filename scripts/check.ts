/**
 * Engine sanity + determinism harness. Run with `npm run check`.
 * A quick standalone smoke test; the fuller suite is `npm test` (Vitest).
 */

import { ONE } from "../src/engine/fixed";
import { newMatch, pickOrder, resolve } from "../src/engine/index";
import type { GameState, HeroKind, Order } from "../src/engine/index";
import { TABLE_SIZE } from "../src/engine/trig";

const TEAM_A: [HeroKind, HeroKind, HeroKind] = ["ram", "arc", "boulder"];
const TEAM_B: [HeroKind, HeroKind, HeroKind] = ["hook", "vex", "comet"];

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

function randomOrder(r: () => number, s: GameState, owner: 0 | 1): Order {
  const mine = s.bodies.filter((b) => b.owner === owner && b.alive);
  if (mine.length === 0 || r() < 0.1) {
    return { bodyId: -1, angleIdx: 0, power: 0, ability: false, hold: true };
  }
  const b = mine[Math.floor(r() * mine.length)]!;
  return {
    bodyId: b.id,
    angleIdx: Math.floor(r() * TABLE_SIZE),
    power: Math.floor(r() * ONE),
    ability: r() < 0.3,
  };
}

function hash(s: GameState): string {
  return JSON.stringify({
    turn: s.turn,
    hold: s.hold,
    mom: s.teams.map((t) => t.momentum),
    bodies: s.bodies.map((b) => [b.x, b.y, b.vx, b.vy, b.alive, b.respawnIn]),
  });
}

function fuzz(seed: number, turns: number): { final: string; log: [Order, Order][] } {
  const r = rng(seed);
  let s = newMatch({ teamA: TEAM_A, teamB: TEAM_B });
  const log: [Order, Order][] = [];
  for (let i = 0; i < turns && !s.over; i++) {
    const oa = randomOrder(r, s, 0);
    const ob = randomOrder(r, s, 1);
    log.push([oa, ob]);
    s = resolve(s, oa, ob).state;
    for (const b of s.bodies) {
      for (const n of [b.x, b.y, b.vx, b.vy]) {
        if (!Number.isFinite(n)) throw new Error(`non-finite at turn ${i}: ${n}`);
      }
    }
  }
  return { final: hash(s), log };
}

function replay(log: [Order, Order][]): string {
  let s = newMatch({ teamA: TEAM_A, teamB: TEAM_B });
  for (const [a, b] of log) {
    if (s.over) break;
    s = resolve(s, a, b).state;
  }
  return hash(s);
}

let failed = 0;
const ok = (name: string, cond: boolean) => {
  console.log(`${cond ? "  ok  " : " FAIL "} ${name}`);
  if (!cond) failed++;
};

const a = fuzz(1234, 80);
const b = fuzz(1234, 80);
ok("déterminisme : deux runs identiques", a.final === b.final);
ok("replay : le log rejoue l'état final", replay(a.log) === a.final);

let stable = true;
for (const seed of [1, 7, 42, 9001, 123456]) {
  try {
    fuzz(seed, 300);
  } catch (e) {
    stable = false;
    console.log("   ", (e as Error).message);
  }
}
ok("stabilité : 5 seeds x 300 tours, tout fini", stable);

// bot plays a full match against itself without crashing / stalling
let botGame: GameState = newMatch({ teamA: TEAM_A, teamB: TEAM_B });
let guard = 0;
while (!botGame.over && guard++ < 400) {
  const oa = pickOrder(botGame, 0, 2);
  const ob = pickOrder(botGame, 1, 2);
  botGame = resolve(botGame, oa, ob).state;
}
ok("bot : match complet bot vs bot se termine", botGame.over && guard < 400);

console.log(failed === 0 ? "\nALL GREEN\n" : `\n${failed} FAILURE(S)\n`);
process.exit(failed === 0 ? 0 : 1);
