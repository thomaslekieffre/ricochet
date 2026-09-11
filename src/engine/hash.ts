/**
 * Stable hash of the simulation-relevant slice of a GameState.
 *
 * Client and authoritative server each hash their state after a turn and compare
 * (docs/PHASES.md P3). A mismatch means desync — the client snaps to the server's
 * state. Pure, deterministic, no floats beyond the already-integer fixed values.
 */

import type { GameState } from "./types";

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Canonical string form of the parts that must match across hosts. */
export function serializeState(s: GameState): string {
  const bodies = s.bodies
    .map((b) =>
      [
        b.id,
        b.x,
        b.y,
        b.vx,
        b.vy,
        b.alive ? 1 : 0,
        b.respawnIn,
        b.actedLastTurn ? 1 : 0,
      ].join(","),
    )
    .join(";");
  const pulses = s.pulses
    .map((p) => [p.owner, p.x, p.y, p.turnsLeft].join(","))
    .join(";");
  const walls = s.walls
    .map((w) => [w.x1, w.y1, w.x2, w.y2, w.turnsLeft].join(","))
    .join(";");
  return [
    s.turn,
    s.hold[0],
    s.hold[1],
    s.teams[0].momentum,
    s.teams[1].momentum,
    s.over ? 1 : 0,
    s.winner ?? -1,
    s.arena.zone.r,
    bodies,
    pulses,
    walls,
  ].join("|");
}

export function hashState(s: GameState): string {
  return fnv1a(serializeState(s));
}
