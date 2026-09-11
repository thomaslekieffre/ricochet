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
export const QUAKE_FORCE = fromInt(650);
export const SECONDWIND_LAUNCH = fromInt(530); // Ram
export const SLIP_NOOP = 0; // Comet slipstream has no number, just a flag
export const YANK_RANGE = fromInt(380); // Hook Anchor Toss
export const YANK_PULL = fromInt(660); // pull fixe de l'Anchor Toss (portée, capacité)
// Accroche (passive, contact de charge normal) : contrairement au knockback
// standard de tout autre héros, qui scale avec la vitesse d'impact, la prise
// au contact utilisait un pull FIXE — une charge à fond ou à peine avait le
// même effet, quasi nul. Trouvé en objectivant un round-robin bot vs bot
// (docs/PHASES.md, 2026-09-11) : Hook perdait 0/7 matchups, très en dessous
// des autres héros de mêlée. Le contact scale maintenant sur la vitesse de
// charge de Hook (comme le bonus d'élan de Ram plus haut), avec un plancher
// pour qu'une charge courte ne soit pas totalement inoffensive.
export const YANK_CONTACT_PULL_RATIO = fromFloat(0.7); // fraction de la vitesse de Hook convertie en pull
export const YANK_CONTACT_PULL_MIN = fromInt(340); // plancher — l'ancien pull fixe était nettement plus bas (448)
export const YANK_SELF_KEEP = fromFloat(0.4); // vitesse gardée par Hook après le grappin (était 0.2)
export const COMET_PASS_SHOVE = fromInt(650); // Comet — poussée sur le corps traversé
export const RICOCHET_BOUNCES = 1; // Sling
export const FLARE_DELAY = 1; // Prism — turns before a pulse detonates
export const FLARE_RADIUS = fromInt(210);
export const FLARE_FORCE = fromInt(1000);
export const WALL_TURNS = 2; // Prism wall lifetime
export const WALL_LEN = fromInt(190);
export const SINKHOLE_RADIUS = fromInt(230); // Vex — Effondrement
export const SINKHOLE_FORCE = fromInt(900);
export const SINKHOLE_STILL_BONUS = fromFloat(1.4); // x force si Vex n'a pas agi au tour d'avant
export const ARC_SPLASH_RADIUS = fromInt(90); // Arc — éclats à l'impact (tir de base)
export const ARC_SPLASH_RADIUS_FRAG = fromInt(160); // avec Fragmentation armée
export const ARC_SPLASH_FORCE_FRAC = fromFloat(0.55); // fraction du kb direct appliquée en éclaboussure

// --- passives ---
export const OVERWATCH_BONUS = fromFloat(0.3); // Sling +30% kb if it held last turn
export const COMET_MOM_PER_PASS = 1; // Comet +1 Momentum per body passed
export const CHARGE_REF_DIST = fromInt(190); // Ram — distance for full bonus
export const CHARGE_BONUS_MAX = fromFloat(2.8); // Ram — max extra impulse fraction
