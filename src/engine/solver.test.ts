import { describe, expect, it } from "vitest";
import { fromFloat, ONE, toFloat } from "./fixed";
import { newMatch, resolve } from "./index";
import type { GameState, HeroKind, Order } from "./index";
import { angleToIdx, TABLE_SIZE } from "./trig";

const HOLD: Order = { bodyId: -1, angleIdx: 0, power: 0, ability: false, hold: true };

/** An order that nudges body `id` toward the zone centre at gentle power. */
function towardZone(s: GameState, id: number): Order {
  const body = s.bodies.find((b) => b.id === id);
  if (!body || !body.alive) return HOLD;
  const dx = toFloat(s.arena.zone.x - body.x);
  const dy = toFloat(s.arena.zone.y - body.y);
  const dist = Math.hypot(dx, dy);
  return {
    bodyId: id,
    angleIdx: angleToIdx(Math.atan2(dy, dx)),
    power: fromFloat(Math.min(dist / 1400, 0.22)),
    ability: false,
  };
}

const A: [HeroKind, HeroKind, HeroKind] = ["ram", "sling", "boulder"];
const B: [HeroKind, HeroKind, HeroKind] = ["hook", "prism", "comet"];

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}
const randOrder = (r: () => number, s: GameState, o: 0 | 1): Order => {
  const mine = s.bodies.filter((b) => b.owner === o && b.alive);
  if (!mine.length || r() < 0.15) {
    return { bodyId: -1, angleIdx: 0, power: 0, ability: false, hold: true };
  }
  const b = mine[Math.floor(r() * mine.length)]!;
  return {
    bodyId: b.id,
    angleIdx: Math.floor(r() * TABLE_SIZE),
    power: Math.floor(r() * ONE),
    ability: r() < 0.35,
  };
};
const hash = (s: GameState) =>
  JSON.stringify({
    t: s.turn,
    h: s.hold,
    m: s.teams.map((x) => x.momentum),
    b: s.bodies.map((b) => [b.x, b.y, b.vx, b.vy, b.alive]),
  });

describe("solver — mode Contrôle", () => {
  it("est déterministe (mêmes entrées → même sortie)", () => {
    const play = (seed: number) => {
      const r = rng(seed);
      let s = newMatch({ teamA: A, teamB: B });
      for (let i = 0; i < 60 && !s.over; i++) {
        s = resolve(s, randOrder(r, s, 0), randOrder(r, s, 1)).state;
      }
      return hash(s);
    };
    expect(play(777)).toBe(play(777));
    expect(play(1)).not.toBe(play(2));
  });

  it("ne produit jamais de NaN sur de longues parties", () => {
    for (const seed of [3, 19, 404, 55555]) {
      const r = rng(seed);
      let s = newMatch({ teamA: A, teamB: B });
      for (let i = 0; i < 250 && !s.over; i++) {
        s = resolve(s, randOrder(r, s, 0), randOrder(r, s, 1)).state;
        for (const b of s.bodies) {
          for (const n of [b.x, b.y, b.vx, b.vy]) expect(Number.isFinite(n)).toBe(true);
        }
      }
    }
  });

  it("garde le Momentum dans [0, 5]", () => {
    const r = rng(42);
    let s = newMatch({ teamA: A, teamB: B });
    for (let i = 0; i < 120 && !s.over; i++) {
      s = resolve(s, randOrder(r, s, 0), randOrder(r, s, 1)).state;
      for (const t of s.teams) {
        expect(t.momentum).toBeGreaterThanOrEqual(0);
        expect(t.momentum).toBeLessThanOrEqual(5);
      }
    }
  });

  it("marque la zone quand un camp y a la majorité", () => {
    let s = newMatch({ teamA: A, teamB: B });
    let captured = false;
    for (let i = 0; i < 30 && !s.over; i++) {
      const res = resolve(s, towardZone(s, 0), HOLD);
      s = res.state;
      if (res.events.some((e) => e.kind === "capture" && e.owner === 0)) captured = true;
    }
    expect(captured).toBe(true);
    expect(s.hold[0]).toBeGreaterThan(0);
  });

  it("termine la partie quand une jauge atteint la cible", () => {
    let s = newMatch({ teamA: A, teamB: B, config: { targetHold: 3, maxTurns: 200 } });
    for (let i = 0; i < 60 && !s.over; i++) s = resolve(s, towardZone(s, 0), HOLD).state;
    expect(s.over).toBe(true);
    expect(s.winner).toBe(0);
  });
});
