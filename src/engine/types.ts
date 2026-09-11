/** Shared engine types. Fields tagged "fixed" are Q16.16 values (see fixed.ts). */

export type HeroKind =
  | "boulder"
  | "ram"
  | "comet"
  | "hook"
  | "sling"
  | "prism"
  | "vex"
  | "arc";
export type Archetype = "brawler" | "dasher" | "sniper" | "mage";

export interface V {
  x: number; // fixed
  y: number; // fixed
}

export interface Body {
  id: number; // stable — drives deterministic iteration order
  owner: 0 | 1;
  hero: HeroKind;
  x: number; // fixed
  y: number; // fixed
  vx: number; // fixed, units/sec
  vy: number; // fixed
  radius: number; // fixed
  mass: number; // fixed (ONE == baseline)
  alive: boolean;
  respawnIn: number; // turns before returning; 0 == on field

  // per-turn scratch (reset by the solver)
  acting: boolean; // the hero this owner chose to move this turn
  charging: boolean; // moving under its own launch — enables contact knockback
  chargeDist: number; // fixed — distance travelled while charging
  intangible: boolean; // Comet slipstream: ignores all collisions this turn
  passedThisTurn: number[]; // ids Comet passed through (for its passive)
  actedLastTurn: boolean; // did this body move on the previous turn (Sling passive)
  aimIdx: number; // last aim direction index (for deferred effects)
}

export interface Projectile {
  owner: 0 | 1;
  x: number; // fixed
  y: number; // fixed
  vx: number; // fixed
  vy: number; // fixed
  radius: number; // fixed
  kb: number; // fixed — impulse magnitude delivered on hit
  bounces: number; // walls it may still bounce off
  splashRadius: number; // fixed — 0 == single-target hit (Sling); >0 == AoE on impact (Arc)
  dead: boolean;
}

export interface Pulse {
  owner: 0 | 1;
  x: number; // fixed
  y: number; // fixed
  turnsLeft: number; // detonates when it reaches 0 at the start of a turn
  radius: number; // fixed
  force: number; // fixed
}

export interface Wall {
  x1: number; // fixed
  y1: number;
  x2: number;
  y2: number;
  restitution: number; // fixed
  turnsLeft: number; // -1 == permanent (arena geometry), >=0 == temporary (Prism)
}

/** Rectangular strip that adds a constant velocity to bodies inside it (Fonderie). */
export interface Conveyor {
  x: number; // fixed — top-left
  y: number;
  w: number;
  h: number;
  ax: number; // fixed — velocity added per second
  ay: number;
}

/** Elastic pinball bumper (Flipper). */
export interface Bumper {
  x: number; // fixed
  y: number;
  radius: number; // fixed
  gain: number; // fixed — outward impulse multiplier (> ONE)
}

export interface Arena {
  id: string;
  name: string;
  w: number; // fixed — field size; the outer edge is always the KO boundary
  h: number;
  zone: { x: number; y: number; r: number }; // fixed — the control zone
  spawn: [V[], V[]]; // 3 spawn points per owner
  walls: Wall[];
  conveyors: Conveyor[];
  bumpers: Bumper[];
}

export interface Team {
  momentum: number; // 0..MOM_MAX
}

export interface GameState {
  turn: number;
  bodies: Body[];
  projectiles: Projectile[]; // only alive during a turn's simulation
  pulses: Pulse[];
  walls: Wall[]; // arena walls + live Prism walls
  teams: [Team, Team];
  hold: [number, number]; // accumulated zone-control points
  arena: Arena;
  config: MatchConfig;
  over: boolean;
  winner: 0 | 1 | null;
}

export interface MatchConfig {
  targetHold: number; // points to win
  maxTurns: number; // then sudden death
  suddenDeathShrink: number; // fixed — zone radius removed per overtime turn
}

/** One planned move: pick a hero, aim it, optionally spend Momentum on its active. */
export interface Order {
  bodyId: number; // which of the owner's alive heroes acts
  angleIdx: number; // trig table index
  power: number; // fixed, 0..ONE
  ability: boolean; // fire the active (needs enough Momentum, else ignored)
  hold?: boolean; // pass this turn entirely
}

export interface Snap {
  id: number;
  x: number;
  y: number;
  alive: boolean;
  charging: boolean;
  hero: HeroKind;
  owner: 0 | 1;
}

export interface ProjSnap {
  x: number;
  y: number;
  owner: 0 | 1;
}

export interface Frame {
  bodies: Snap[];
  projectiles: ProjSnap[];
  hold: [number, number];
  control: -1 | 0 | 1; // who holds the zone this instant (-1 none)
  hit: boolean; // collision / KO this substep — drives screen shake
  ko: boolean; // a KO happened this substep — bigger shake + sound
}

export interface TurnResult {
  state: GameState;
  frames: Frame[];
  events: TurnEvent[];
}

export type TurnEvent =
  | { kind: "ko"; bodyId: number; by: 0 | 1 }
  | { kind: "capture"; owner: 0 | 1; hold: [number, number] }
  | { kind: "ability"; bodyId: number; hero: HeroKind }
  | { kind: "over"; winner: 0 | 1 };
