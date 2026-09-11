/**
 * Every gameplay knob, in fixed-point, in one place.
 * Prototype values — the feel gets dialed in by playing, not by theory.
 */

import { fromFloat, fromInt } from "./fixed";

// --- simulation ---
export const DT = fromFloat(1 / 60); // seconds per substep
export const SUBSTEPS = 260; // hard cap on a turn's simulation length
export const SETTLE_SUBSTEPS = 110; // shorter cap for deferred re-settles (Ram)
export const FRICTION = fromFloat(0.973); // velocity retained per substep
export const STOP_EPS = fromFloat(8); // speed below which a body is parked

// --- collision ---
export const RESTITUTION = fromFloat(0.7); // body-vs-body bounciness
export const WALL_RESTITUTION = fromFloat(0.78);

// --- launch / power ---
export const POWER_MIN_DIST = 6; // world units of drag below which it's a "hold"

// --- match ---
export const RESPAWN_TURNS = 1;
export const MOM_MAX = 5;
export const MOM_PER_TURN = 1;

export const DEFAULT_CONFIG = {
  targetHold: 15,
  maxTurns: 60,
  suddenDeathShrink: fromInt(26),
};

// --- ability numbers ---
export const QUAKE_RADIUS = fromInt(250); // Boulder
export const QUAKE_FORCE = fromInt(1150);
export const SECONDWIND_LAUNCH = fromInt(430); // Ram
export const SLIP_NOOP = 0; // Comet slipstream has no number, just a flag
export const YANK_RANGE = fromInt(380); // Hook Anchor Toss
export const YANK_PULL = fromInt(560);
export const RICOCHET_BOUNCES = 1; // Sling
export const FLARE_DELAY = 1; // Prism — turns before a pulse detonates
export const FLARE_RADIUS = fromInt(210);
export const FLARE_FORCE = fromInt(1000);
export const WALL_TURNS = 2; // Prism wall lifetime
export const WALL_LEN = fromInt(190);

// --- passives ---
export const OVERWATCH_BONUS = fromFloat(0.5); // Sling +50% kb if it held last turn
export const COMET_MOM_PER_PASS = 1; // Comet +1 Momentum per body passed
export const CHARGE_REF_DIST = fromInt(260); // Ram — distance for full bonus
export const CHARGE_BONUS_MAX = fromFloat(1.9); // Ram — max extra impulse fraction
