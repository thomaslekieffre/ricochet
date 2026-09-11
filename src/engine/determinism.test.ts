import { describe, expect, it } from "vitest";
import { ONE } from "./fixed";
import { hashState, newMatch, resolve } from "./index";
import type { GameState, HeroKind, Order } from "./index";
import { SIN_TABLE, TABLE_SIZE } from "./trig-table";

const A: [HeroKind, HeroKind, HeroKind] = ["boulder", "hook", "prism"];
const B: [HeroKind, HeroKind, HeroKind] = ["ram", "comet", "sling"];

describe("déterminisme inter-hôtes", () => {
  it("la table de sinus figée correspond à Math.sin (tolérance ±1 ulp Q16.16)", () => {
    expect(SIN_TABLE.length).toBe(TABLE_SIZE);
    let maxErr = 0;
    for (let i = 0; i < TABLE_SIZE; i++) {
      const fresh = Math.round(Math.sin((i / TABLE_SIZE) * Math.PI * 2) * ONE);
      maxErr = Math.max(maxErr, Math.abs(fresh - SIN_TABLE[i]!));
    }
    expect(maxErr).toBeLessThanOrEqual(1);
  });

  it("hashState est stable pour un état donné", () => {
    const s = newMatch({ teamA: A, teamB: B });
    expect(hashState(s)).toBe(hashState(newMatch({ teamA: A, teamB: B })));
  });

  it("une suite d'ordres produit toujours le même hash final", () => {
    const script: Order[] = [
      { bodyId: 0, angleIdx: 400, power: ONE, ability: false },
      { bodyId: 4, angleIdx: 2200, power: ONE >> 1, ability: false },
      { bodyId: 1, angleIdx: 1024, power: ONE, ability: true },
    ];
    const play = (): GameState => {
      let s = newMatch({ teamA: A, teamB: B });
      for (let i = 0; i < 24; i++) {
        const oa = script[i % script.length]!;
        const ob = script[(i + 1) % script.length]!;
        s = resolve(s, oa, ob).state;
      }
      return s;
    };
    expect(hashState(play())).toBe(hashState(play()));
  });
});
