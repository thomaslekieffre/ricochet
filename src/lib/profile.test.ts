import { beforeEach, describe, expect, it } from "vitest";
import {
  applyOutcome,
  clearProfile,
  freshProfile,
  levelFromXp,
  loadProfile,
  ratingView,
  saveProfile,
  setStore,
  type Outcome,
  type Store,
} from "./profile";
import type { HeroKind } from "../engine/types";

const memStore = (): Store => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};

const TEAM: HeroKind[] = ["ram", "sling", "boulder"];
const OPP: HeroKind[] = ["hook", "prism", "comet"];

const outcome = (o: Partial<Outcome>): Outcome => ({
  mode: "bot",
  botLevel: 2,
  arena: "carrefour",
  team: TEAM,
  opp: OPP,
  won: true,
  turns: 20,
  hold: [15, 9],
  ...o,
});

beforeEach(() => setStore(memStore()));

describe("profil local", () => {
  it("round-trip localStorage", () => {
    const p = freshProfile("Zoe");
    saveProfile(p);
    const back = loadProfile();
    expect(back?.name).toBe("Zoe");
    expect(back?.xp).toBe(0);
    clearProfile();
    expect(loadProfile()).toBeNull();
  });

  it("nettoie le pseudo (espaces, longueur)", () => {
    expect(freshProfile("  a  b  ").name).toBe("a b");
    expect(freshProfile("x".repeat(40)).name).toHaveLength(16);
    expect(freshProfile("").name).toBe("Joueur");
  });

  it("entrée corrompue => profil absent", () => {
    const s = memStore();
    s.setItem("ricochet.profile.v1", "{pas du json");
    setStore(s);
    expect(loadProfile()).toBeNull();
  });

  it("une victoire vs bot monte la note et donne de l'XP", () => {
    const { profile, xpGained, ratingDelta } = applyOutcome(
      freshProfile("Zoe"),
      outcome({ won: true, botLevel: 2 }),
    );
    expect(xpGained).toBeGreaterThan(0);
    expect(ratingDelta).not.toBeNull();
    expect(ratingDelta!).toBeGreaterThan(0);
    expect(profile.wins).toBe(1);
    expect(profile.ranked).toBe(1);
    expect(profile.history).toHaveLength(1);
  });

  it("une défaite vs bot descend la note", () => {
    const { ratingDelta, profile } = applyOutcome(
      freshProfile("Zoe"),
      outcome({ won: false }),
    );
    expect(ratingDelta!).toBeLessThan(0);
    expect(profile.losses).toBe(1);
  });

  it("le hotseat ne touche pas la note", () => {
    const { ratingDelta, profile } = applyOutcome(
      freshProfile("Zoe"),
      outcome({ mode: "hotseat", botLevel: undefined }),
    );
    expect(ratingDelta).toBeNull();
    expect(profile.ranked).toBe(0);
    expect(profile.rating).toEqual(freshProfile("x").rating);
  });

  it("suit la série et prime les séries >= 3", () => {
    let p = freshProfile("Zoe");
    const gains: number[] = [];
    for (let i = 0; i < 3; i++) {
      const a = applyOutcome(p, outcome({ won: true, botLevel: 1 }));
      p = a.profile;
      gains.push(a.xpGained);
    }
    expect(p.streak).toBe(3);
    expect(gains[2]!).toBeGreaterThan(gains[0]!); // 3e victoire primée
    const loss = applyOutcome(p, outcome({ won: false }));
    expect(loss.profile.streak).toBe(-1);
  });

  it("détecte le passage de niveau", () => {
    let p = freshProfile("Zoe");
    let leveled = false;
    for (let i = 0; i < 5 && !leveled; i++) {
      const a = applyOutcome(p, outcome({ won: true, botLevel: 3 }));
      p = a.profile;
      if (a.leveledTo) leveled = true;
    }
    expect(leveled).toBe(true);
    expect(levelFromXp(p.xp).level).toBeGreaterThan(1);
  });

  it("plafonne l'historique à 40", () => {
    let p = freshProfile("Zoe");
    for (let i = 0; i < 50; i++) p = applyOutcome(p, outcome({})).profile;
    expect(p.history).toHaveLength(40);
    expect(p.games).toBe(50);
  });

  it("ratingView : non classé sous 5 parties, classé au-delà", () => {
    let p = freshProfile("Zoe");
    expect(ratingView(p).placed).toBe(false);
    for (let i = 0; i < 5; i++) p = applyOutcome(p, outcome({})).profile;
    const v = ratingView(p);
    expect(v.placed).toBe(true);
    expect(v.placementLeft).toBe(0);
    expect(v.tierLabel).toBeTruthy();
  });

  it("levelFromXp : bornes de la courbe", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, span: 100 });
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(299).level).toBe(2);
    expect(levelFromXp(300).level).toBe(3);
    expect(levelFromXp(-50).level).toBe(1);
  });
});
