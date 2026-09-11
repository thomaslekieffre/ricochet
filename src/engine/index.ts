import { ARENAS, CARREFOUR, arenaById } from "./arenas";
import { makeBody } from "./heroes";
import { DEFAULT_CONFIG } from "./tuning";
import type { Arena, GameState, HeroKind, MatchConfig } from "./types";

export * as fx from "./fixed";
export * as trig from "./trig";
export * as tuning from "./tuning";
export { resolve } from "./solver";
export { hashState, serializeState } from "./hash";
export { pickOrder } from "./bot";
export type { BotLevel } from "./bot";
export { HEROES, ROSTER, makeBody } from "./heroes";
export { ARENAS, CARREFOUR, FONDERIE, FLIPPER, arenaById } from "./arenas";
export type {
  Arena,
  Archetype,
  Body,
  Bumper,
  Conveyor,
  Frame,
  GameState,
  HeroKind,
  MatchConfig,
  Order,
  Projectile,
  ProjSnap,
  Pulse,
  Snap,
  Team,
  TurnEvent,
  TurnResult,
  V,
  Wall,
} from "./types";

export interface MatchSetup {
  teamA: [HeroKind, HeroKind, HeroKind];
  teamB: [HeroKind, HeroKind, HeroKind];
  arena?: Arena | string;
  config?: Partial<MatchConfig>;
}

/** Build a fresh match. Body ids: 0..2 for owner 0, 3..5 for owner 1. */
export function newMatch(setup: MatchSetup): GameState {
  const arena =
    typeof setup.arena === "string"
      ? arenaById(setup.arena)
      : (setup.arena ?? CARREFOUR);
  const config: MatchConfig = { ...DEFAULT_CONFIG, ...setup.config };

  const bodies = [
    ...setup.teamA.map((h, i) => makeBody(i, 0, h, arena.spawn[0][i]!)),
    ...setup.teamB.map((h, i) => makeBody(3 + i, 1, h, arena.spawn[1][i]!)),
  ];

  return {
    turn: 0,
    bodies,
    projectiles: [],
    pulses: [],
    walls: arena.walls.map((w) => ({ ...w })),
    teams: [{ momentum: 2 }, { momentum: 2 }],
    hold: [0, 0],
    arena,
    config,
    over: false,
    winner: null,
  };
}

export { ARENAS as ALL_ARENAS };
