import { describe, expect, it } from "vitest";
import {
  DEFAULT_RATING,
  decay,
  fromDisplay,
  settle1v1,
  softReset,
  tierOf,
  tierRange,
  toDisplay,
  update,
} from "./glicko2";

describe("glicko-2", () => {
  it("reproduit l'exemple de référence de Glickman", () => {
    // Joueur 1500 / RD 200 / σ 0.06, trois adversaires (W, L, L).
    const player = fromDisplay(1500, 200, 0.06);
    const games = [
      { opponent: fromDisplay(1400, 30), score: 1 },
      { opponent: fromDisplay(1550, 100), score: 0 },
      { opponent: fromDisplay(1700, 300), score: 0 },
    ];
    const next = update(player, games, 0.5);
    const d = toDisplay(next);
    expect(d.rating).toBeCloseTo(1464.06, 1);
    expect(d.rd).toBeCloseTo(151.52, 1);
    expect(next.sigma).toBeCloseTo(0.05999, 4);
  });

  it("gagner monte le rating, perdre le descend", () => {
    const a = DEFAULT_RATING;
    const b = DEFAULT_RATING;
    const [aw] = settle1v1(a, b, 0);
    const [al] = settle1v1(a, b, 1);
    expect(toDisplay(aw).rating).toBeGreaterThan(1500);
    expect(toDisplay(al).rating).toBeLessThan(1500);
  });

  it("un compte neuf converge vite (RD chute sur quelques matchs)", () => {
    let me = DEFAULT_RATING;
    const strong = fromDisplay(1800, 60);
    for (let i = 0; i < 10; i++) me = update(me, [{ opponent: strong, score: 1 }], 0.5);
    expect(toDisplay(me).rd).toBeLessThan(150);
    expect(toDisplay(me).rating).toBeGreaterThan(1600);
  });

  it("l'inactivité regrandit le RD, plafonné à 350", () => {
    let r = fromDisplay(1500, 60);
    for (let i = 0; i < 500; i++) r = decay(r);
    expect(toDisplay(r).rd).toBeLessThanOrEqual(350);
    expect(toDisplay(r).rd).toBeGreaterThan(60);
  });

  it("les paliers sont ordonnés", () => {
    expect(tierOf(800)).toBe("bronze");
    expect(tierOf(1300)).toBe("or");
    expect(tierOf(1900)).toBe("diamant");
    expect(tierOf(2500)).toBe("master");
  });

  it("tierRange donne le plancher/plafond du palier courant, master sans plafond", () => {
    expect(tierRange(1300)).toEqual({ floor: 1200, ceiling: 1500 });
    expect(tierRange(900)).toEqual({ floor: 900, ceiling: 1200 }); // pile au plancher d'Argent
    expect(tierRange(2500)).toEqual({ floor: 2100, ceiling: null });
  });

  it("le soft reset rapproche de la moyenne sans tout effacer", () => {
    const high = fromDisplay(2200, 80);
    const after = toDisplay(softReset(high));
    expect(after.rating).toBeLessThan(2200);
    expect(after.rating).toBeGreaterThan(1500);
  });
});
