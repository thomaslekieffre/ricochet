/**
 * The deterministic turn solver — mode Contrôle (zone capture).
 *
 *   resolve(state, orderA, orderB) -> { state, frames, events }
 *
 * Pure. Same inputs -> byte-identical outputs. No Math.random, no Date, no
 * floating point in the hot path; every pairwise interaction is visited in
 * ascending body-id order. See docs/ricochet-playbook.html §07 and docs/PHASES.md.
 *
 * A turn:
 *   1. detonate due pulses, expire old walls
 *   2. apply both orders — the acting hero of each side launches / shoots /
 *      triggers its active (Momentum permitting)
 *   3. simulate up to SUBSTEPS fixed steps: integrate, friction, conveyors,
 *      bumpers, walls, KO on leaving the field, body-body collisions, projectiles
 *   4. deferred effects (Ram Second Wind)
 *   5. zone scoring, Momentum, respawns, win check
 */

import * as fx from "./fixed";
import { HEROES } from "./heroes";
import { cosIdx, sinIdx } from "./trig";
import * as T from "./tuning";
import type {
  Body,
  Frame,
  GameState,
  Order,
  Projectile,
  ProjSnap,
  Pulse,
  Snap,
  TurnEvent,
  TurnResult,
  Wall,
} from "./types";

function cloneState(s: GameState): GameState {
  return {
    turn: s.turn,
    bodies: s.bodies.map((b) => ({ ...b, passedThisTurn: [...b.passedThisTurn] })),
    projectiles: [],
    pulses: s.pulses.map((p) => ({ ...p })),
    walls: s.walls.map((w) => ({ ...w })),
    teams: [{ ...s.teams[0] }, { ...s.teams[1] }],
    hold: [s.hold[0], s.hold[1]],
    arena: s.arena,
    config: s.config,
    over: s.over,
    winner: s.winner,
  };
}

const speedOf = (b: { vx: number; vy: number }): number =>
  fx.sqrt(fx.mul(b.vx, b.vx) + fx.mul(b.vy, b.vy));

function inZone(s: GameState, b: Body): boolean {
  const z = s.arena.zone;
  const dx = b.x - z.x;
  const dy = b.y - z.y;
  return fx.mul(dx, dx) + fx.mul(dy, dy) <= fx.mul(z.r, z.r);
}

function control(s: GameState): -1 | 0 | 1 {
  let a = 0;
  let b = 0;
  for (const body of s.bodies) {
    if (!body.alive) continue;
    if (!inZone(s, body)) continue;
    if (body.owner === 0) a++;
    else b++;
  }
  if (a > b) return 0;
  if (b > a) return 1;
  return -1;
}

function snapshot(s: GameState, hit: boolean, ko: boolean): Frame {
  const bodies: Snap[] = s.bodies.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    alive: b.alive,
    charging: b.charging,
    hero: b.hero,
    owner: b.owner,
  }));
  const projectiles: ProjSnap[] = s.projectiles
    .filter((p) => !p.dead)
    .map((p) => ({ x: p.x, y: p.y, owner: p.owner }));
  return {
    bodies,
    projectiles,
    hold: [s.hold[0], s.hold[1]],
    control: control(s),
    hit,
    ko,
  };
}

export function resolve(prev: GameState, orderA: Order, orderB: Order): TurnResult {
  const s = cloneState(prev);
  const orders: [Order, Order] = [orderA, orderB];
  const events: TurnEvent[] = [];
  const frames: Frame[] = [];

  // reset per-turn scratch
  for (const b of s.bodies) {
    b.actedLastTurn = b.acting;
    b.acting = false;
    b.charging = false;
    b.chargeDist = 0;
    b.intangible = false;
    b.passedThisTurn = [];
  }

  // 1. pulses & walls
  for (const p of s.pulses) p.turnsLeft -= 1;
  for (const p of s.pulses) {
    if (p.turnsLeft <= 0) detonatePulse(s, p);
  }
  s.pulses = s.pulses.filter((p) => p.turnsLeft > 0);
  for (const w of s.walls) if (w.turnsLeft > 0) w.turnsLeft -= 1;
  s.walls = s.walls.filter((w) => w.turnsLeft !== 0);

  // 2. apply orders
  const secondWind = new Set<number>();
  for (let o = 0 as 0 | 1; o <= 1; o = (o + 1) as 0 | 1) {
    const order = orders[o];
    if (order.hold) continue;
    // un héros qui a agi au tour précédent est en repos ce tour-ci (ordre
    // ignoré, comme un héros mort ou introuvable) — rejouable dès le tour d'après
    const body = s.bodies.find(
      (b) => b.id === order.bodyId && b.owner === o && b.alive && !b.actedLastTurn,
    );
    if (!body) continue;
    body.acting = true;
    body.aimIdx = order.angleIdx;
    const def = HEROES[body.hero];
    const dirx = cosIdx(order.angleIdx);
    const diry = sinIdx(order.angleIdx);
    const power = fx.clamp(order.power, 0, fx.ONE);
    const canAbility = order.ability && s.teams[o].momentum >= def.abilityCost;
    if (canAbility) {
      s.teams[o].momentum -= def.abilityCost;
      events.push({ kind: "ability", bodyId: body.id, hero: body.hero });
    }

    const launch = (scale: number) => {
      const spd = fx.mul(def.launchBase + fx.mul(def.launchPower, power), scale);
      body.vx = fx.mul(dirx, spd);
      body.vy = fx.mul(diry, spd);
      body.charging = true;
    };

    switch (body.hero) {
      case "boulder":
        launch(fx.ONE);
        if (canAbility) quake(s, body);
        break;
      case "ram":
        launch(fx.ONE);
        if (canAbility) secondWind.add(body.id);
        break;
      case "comet":
        launch(fx.ONE);
        if (canAbility) body.intangible = true;
        break;
      case "hook":
        if (canAbility) {
          anchorToss(s, body, dirx, diry);
        } else {
          launch(fx.ONE);
        }
        break;
      case "sling": {
        launch(fx.ONE);
        const kbBase = fx.fromInt(1400);
        const owBonus = body.actedLastTurn ? 0 : fx.mul(kbBase, T.OVERWATCH_BONUS);
        spawnProjectile(s, {
          owner: o,
          x: body.x + fx.mul(dirx, body.radius + fx.fromInt(6)),
          y: body.y + fx.mul(diry, body.radius + fx.fromInt(6)),
          vx: fx.mul(dirx, fx.fromInt(1500) + fx.mul(fx.fromInt(900), power)),
          vy: fx.mul(diry, fx.fromInt(1500) + fx.mul(fx.fromInt(900), power)),
          radius: fx.fromInt(15),
          kb: kbBase + owBonus,
          bounces: canAbility ? T.RICOCHET_BOUNCES : 0,
          splashRadius: 0,
          dead: false,
        });
        break;
      }
      case "vex":
        launch(fx.ONE);
        if (canAbility) sinkhole(s, body);
        break;
      case "arc": {
        launch(fx.ONE);
        const kbBase = fx.fromInt(1000);
        const owBonus = body.actedLastTurn ? 0 : fx.mul(kbBase, T.OVERWATCH_BONUS);
        spawnProjectile(s, {
          owner: o,
          x: body.x + fx.mul(dirx, body.radius + fx.fromInt(6)),
          y: body.y + fx.mul(diry, body.radius + fx.fromInt(6)),
          vx: fx.mul(dirx, fx.fromInt(900) + fx.mul(fx.fromInt(500), power)),
          vy: fx.mul(diry, fx.fromInt(900) + fx.mul(fx.fromInt(500), power)),
          radius: fx.fromInt(17),
          kb: kbBase + owBonus,
          bounces: 0,
          splashRadius: canAbility ? T.ARC_SPLASH_RADIUS_FRAG : T.ARC_SPLASH_RADIUS,
          dead: false,
        });
        break;
      }
      case "prism":
        launch(fx.ONE);
        if (canAbility) {
          spawnWall(s, body, dirx, diry);
        } else {
          const px = body.x + fx.mul(dirx, T.FLARE_RADIUS);
          const py = body.y + fx.mul(diry, T.FLARE_RADIUS);
          s.pulses.push({
            owner: o,
            x: px,
            y: py,
            turnsLeft: T.FLARE_DELAY + 1, // decremented at the top of the next turn
            radius: T.FLARE_RADIUS,
            force: T.FLARE_FORCE,
          });
        }
        break;
    }
  }

  // 3. simulate
  simulate(s, frames, T.SUBSTEPS);

  // 4. deferred — Ram Second Wind
  for (const id of secondWind) {
    const b = s.bodies.find((x) => x.id === id && x.alive);
    if (!b) continue;
    const spd = T.SECONDWIND_LAUNCH;
    b.vx = fx.mul(cosIdx(b.aimIdx), spd);
    b.vy = fx.mul(sinIdx(b.aimIdx), spd);
    b.charging = true;
  }
  if (secondWind.size > 0) simulate(s, frames, T.SETTLE_SUBSTEPS);

  while (frames.length < 2) frames.push(snapshot(s, false, false));

  // 5a. zone scoring
  const ctrl = control(s);
  if (ctrl === 0) {
    s.hold[0] += 1;
    events.push({ kind: "capture", owner: 0, hold: [s.hold[0], s.hold[1]] });
  } else if (ctrl === 1) {
    s.hold[1] += 1;
    events.push({ kind: "capture", owner: 1, hold: [s.hold[0], s.hold[1]] });
  }

  // 5b. Momentum (Comet passive first, then regen, then clamp)
  for (const b of s.bodies) {
    if (b.hero === "comet" && b.passedThisTurn.length > 0) {
      s.teams[b.owner].momentum +=
        b.passedThisTurn.length * T.COMET_MOM_PER_PASS;
    }
  }
  for (const team of s.teams) {
    team.momentum = fx.clamp(team.momentum + T.MOM_PER_TURN, 0, T.MOM_MAX);
  }

  // 5c. respawns
  for (const b of s.bodies) {
    if (!b.alive && b.respawnIn > 0) {
      b.respawnIn -= 1;
      if (b.respawnIn === 0) respawn(s, b);
    }
    b.charging = false;
    b.chargeDist = 0;
  }
  s.projectiles = [];

  s.turn += 1;

  // 5d. win check
  const { targetHold, maxTurns } = s.config;
  if (s.hold[0] >= targetHold || s.hold[1] >= targetHold) {
    s.over = true;
    s.winner = s.hold[0] > s.hold[1] ? 0 : 1;
  } else if (s.turn >= maxTurns) {
    if (s.hold[0] !== s.hold[1]) {
      s.over = true;
      s.winner = s.hold[0] > s.hold[1] ? 0 : 1;
    } else {
      // sudden death: shrink the zone until someone leads
      s.arena = {
        ...s.arena,
        zone: {
          ...s.arena.zone,
          r: Math.max(fx.fromInt(60), s.arena.zone.r - s.config.suddenDeathShrink),
        },
      };
    }
  }
  if (s.over && s.winner !== null) events.push({ kind: "over", winner: s.winner });

  return { state: s, frames, events };
}

// ---------------------------------------------------------------------------

function simulate(s: GameState, frames: Frame[], cap: number): void {
  for (let step = 0; step < cap; step++) {
    const { hit, ko } = integrate(s);
    frames.push(snapshot(s, hit, ko));
    if (settled(s)) break;
  }
}

function integrate(s: GameState): { hit: boolean; ko: boolean } {
  let hit = false;
  let ko = false;
  const bs = s.bodies;
  const ar = s.arena;

  // motion + friction + conveyors
  for (const b of bs) {
    if (!b.alive) continue;
    for (const c of ar.conveyors) {
      if (b.x >= c.x && b.x <= c.x + c.w && b.y >= c.y && b.y <= c.y + c.h) {
        b.vx += fx.mul(c.ax, T.DT);
        b.vy += fx.mul(c.ay, T.DT);
      }
    }
    const dx = fx.mul(b.vx, T.DT);
    const dy = fx.mul(b.vy, T.DT);
    b.x += dx;
    b.y += dy;
    if (b.charging) b.chargeDist += fx.sqrt(fx.mul(dx, dx) + fx.mul(dy, dy));
    b.vx = fx.mul(b.vx, T.FRICTION);
    b.vy = fx.mul(b.vy, T.FRICTION);
  }

  // KO — leaving the field
  for (const b of bs) {
    if (!b.alive) continue;
    if (b.x < 0 || b.x > ar.w || b.y < 0 || b.y > ar.h) {
      b.alive = false;
      b.charging = false;
      b.intangible = false;
      b.respawnIn = T.RESPAWN_TURNS;
      b.vx = 0;
      b.vy = 0;
      ko = true;
      hit = true;
    }
  }

  // bumpers
  for (const b of bs) {
    if (!b.alive || b.intangible) continue;
    for (const bump of ar.bumpers) {
      const nx = b.x - bump.x;
      const ny = b.y - bump.y;
      const d = fx.sqrt(fx.mul(nx, nx) + fx.mul(ny, ny));
      const minD = b.radius + bump.radius;
      if (d === 0 || d >= minD) continue;
      const ux = fx.div(nx, d);
      const uy = fx.div(ny, d);
      b.x = bump.x + fx.mul(ux, minD);
      b.y = bump.y + fx.mul(uy, minD);
      const vn = fx.mul(b.vx, ux) + fx.mul(b.vy, uy);
      if (vn < 0) {
        const push = fx.mul(-vn, fx.ONE + bump.gain);
        b.vx += fx.mul(ux, push);
        b.vy += fx.mul(uy, push);
        hit = true;
      }
    }
  }

  // walls
  for (const b of bs) {
    if (!b.alive || b.intangible) continue;
    for (const w of s.walls) if (collideWall(b, w)) hit = true;
  }

  // body-body, deterministic pair order
  for (let i = 0; i < bs.length; i++) {
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i]!;
      const b = bs[j]!;
      if (!a.alive || !b.alive) continue;
      if (a.intangible || b.intangible) continue;
      if (collideBodies(a, b)) hit = true;
    }
  }

  // projectiles
  for (const p of s.projectiles) {
    if (p.dead) continue;
    p.x += fx.mul(p.vx, T.DT);
    p.y += fx.mul(p.vy, T.DT);
    if (p.x < 0 || p.x > ar.w || p.y < 0 || p.y > ar.h) {
      p.dead = true;
      continue;
    }
    for (const w of s.walls) {
      if (p.bounces > 0 && bounceProjectile(p, w)) {
        p.bounces -= 1;
        break;
      }
    }
    for (const b of bs) {
      if (!b.alive || b.owner === p.owner) continue;
      const nx = b.x - p.x;
      const ny = b.y - p.y;
      const d = fx.sqrt(fx.mul(nx, nx) + fx.mul(ny, ny));
      if (d >= b.radius + p.radius) continue;
      const sp = speedOf(p);
      if (sp > 0) {
        const kbTaken = HEROES[b.hero].kbTaken;
        const j = fx.div(fx.mul(fx.mul(p.kb, kbTaken), fx.ONE), b.mass);
        b.vx += fx.div(fx.mul(p.vx, j), sp);
        b.vy += fx.div(fx.mul(p.vy, j), sp);
      }
      if (p.splashRadius > 0) splashHit(s, p, b);
      p.dead = true;
      hit = true;
      break;
    }
  }

  return { hit, ko };
}

function collideBodies(a: Body, b: Body): boolean {
  const nx = b.x - a.x;
  const ny = b.y - a.y;
  const dist = fx.sqrt(fx.mul(nx, nx) + fx.mul(ny, ny));
  const minDist = a.radius + b.radius;
  if (dist === 0 || dist >= minDist) return false;

  const ux = fx.div(nx, dist);
  const uy = fx.div(ny, dist);

  // Comet pass-through (moving, not intangible): shove the other, keep going
  const comet = a.hero === "comet" && a.charging ? a : b.hero === "comet" && b.charging ? b : null;
  if (comet) {
    const other = comet === a ? b : a;
    const dir = comet === a ? -1 : 1; // push `other` away from comet
    const shove = fx.div(T.COMET_PASS_SHOVE, other.mass);
    other.vx += fx.mul(ux, shove * dir);
    other.vy += fx.mul(uy, shove * dir);
    if (!comet.passedThisTurn.includes(other.id)) comet.passedThisTurn.push(other.id);
    comet.vx = fx.mul(comet.vx, fx.fromFloat(0.9));
    comet.vy = fx.mul(comet.vy, fx.fromFloat(0.9));
    return true;
  }

  // Hook Latch (charging into an enemy): pull the target toward Hook, Hook stops
  const hook = a.hero === "hook" && a.charging ? a : b.hero === "hook" && b.charging ? b : null;
  if (hook) {
    const other = hook === a ? b : a;
    if (other.owner !== hook.owner) {
      const hx = hook.x - other.x;
      const hy = hook.y - other.y;
      const hd = fx.sqrt(fx.mul(hx, hx) + fx.mul(hy, hy));
      if (hd > 0) {
        // scale sur la vitesse de charge de Hook (comme le knockback standard
        // de tout autre héros), planchée pour qu'une charge courte reste utile.
        const hookSpeed = fx.sqrt(fx.mul(hook.vx, hook.vx) + fx.mul(hook.vy, hook.vy));
        const scaled = fx.mul(hookSpeed, T.YANK_CONTACT_PULL_RATIO);
        const pull = scaled > T.YANK_CONTACT_PULL_MIN ? scaled : T.YANK_CONTACT_PULL_MIN;
        other.vx = fx.div(fx.mul(hx, pull), hd);
        other.vy = fx.div(fx.mul(hy, pull), hd);
      }
      hook.vx = fx.mul(hook.vx, T.YANK_SELF_KEEP);
      hook.vy = fx.mul(hook.vy, T.YANK_SELF_KEEP);
      hook.charging = false;
      return true;
    }
  }

  // standard impulse with restitution + per-hero knockback modifiers
  const invA = fx.div(fx.ONE, a.mass);
  const invB = fx.div(fx.ONE, b.mass);
  const invSum = invA + invB;

  const overlap = minDist - dist;
  const corrA = fx.div(fx.mul(overlap, invA), invSum);
  const corrB = fx.div(fx.mul(overlap, invB), invSum);
  a.x -= fx.mul(ux, corrA);
  a.y -= fx.mul(uy, corrA);
  b.x += fx.mul(ux, corrB);
  b.y += fx.mul(uy, corrB);

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const vn = fx.mul(rvx, ux) + fx.mul(rvy, uy);
  if (vn > 0) return true;

  let jimp = fx.div(fx.mul(-(fx.ONE + T.RESTITUTION), vn), invSum);

  // aggressor = the charging body, if any; apply its kbDealt + Ram charge bonus
  const aggr = a.charging ? a : b.charging ? b : null;
  if (aggr) {
    let mult = HEROES[aggr.hero].kbDealt;
    if (aggr.hero === "ram") {
      const ratio = fx.clamp(fx.div(aggr.chargeDist, T.CHARGE_REF_DIST), 0, fx.ONE);
      mult += fx.mul(T.CHARGE_BONUS_MAX, ratio);
    }
    jimp = fx.mul(jimp, mult);
  }

  const jx = fx.mul(ux, jimp);
  const jy = fx.mul(uy, jimp);
  const takeA = HEROES[a.hero].kbTaken;
  const takeB = HEROES[b.hero].kbTaken;
  a.vx -= fx.mul(fx.mul(jx, invA), takeA);
  a.vy -= fx.mul(fx.mul(jy, invA), takeA);
  b.vx += fx.mul(fx.mul(jx, invB), takeB);
  b.vy += fx.mul(fx.mul(jy, invB), takeB);
  return true;
}

function closestOnSegment(
  px: number,
  py: number,
  w: Wall,
): { cx: number; cy: number } {
  const ex = w.x2 - w.x1;
  const ey = w.y2 - w.y1;
  const len2 = fx.mul(ex, ex) + fx.mul(ey, ey);
  if (len2 === 0) return { cx: w.x1, cy: w.y1 };
  let t = fx.div(fx.mul(px - w.x1, ex) + fx.mul(py - w.y1, ey), len2);
  t = fx.clamp(t, 0, fx.ONE);
  return { cx: w.x1 + fx.mul(ex, t), cy: w.y1 + fx.mul(ey, t) };
}

function collideWall(b: Body, w: Wall): boolean {
  const { cx, cy } = closestOnSegment(b.x, b.y, w);
  const nx = b.x - cx;
  const ny = b.y - cy;
  const d = fx.sqrt(fx.mul(nx, nx) + fx.mul(ny, ny));
  if (d === 0 || d >= b.radius) return false;
  const ux = fx.div(nx, d);
  const uy = fx.div(ny, d);
  b.x = cx + fx.mul(ux, b.radius);
  b.y = cy + fx.mul(uy, b.radius);
  const vn = fx.mul(b.vx, ux) + fx.mul(b.vy, uy);
  if (vn < 0) {
    const k = fx.mul(-vn, fx.ONE + w.restitution);
    b.vx += fx.mul(ux, k);
    b.vy += fx.mul(uy, k);
  }
  return true;
}

function bounceProjectile(p: Projectile, w: Wall): boolean {
  const { cx, cy } = closestOnSegment(p.x, p.y, w);
  const nx = p.x - cx;
  const ny = p.y - cy;
  const d = fx.sqrt(fx.mul(nx, nx) + fx.mul(ny, ny));
  if (d === 0 || d >= p.radius) return false;
  const ux = fx.div(nx, d);
  const uy = fx.div(ny, d);
  const vn = fx.mul(p.vx, ux) + fx.mul(p.vy, uy);
  p.vx -= fx.mul(ux, fx.mul(vn, fx.fromInt(2)));
  p.vy -= fx.mul(uy, fx.mul(vn, fx.fromInt(2)));
  p.x = cx + fx.mul(ux, p.radius);
  p.y = cy + fx.mul(uy, p.radius);
  return true;
}

function settled(s: GameState): boolean {
  for (const p of s.projectiles) if (!p.dead) return false;
  for (const b of s.bodies) {
    if (!b.alive) continue;
    if (speedOf(b) > T.STOP_EPS) return false;
  }
  return true;
}

// --- abilities -------------------------------------------------------------

function quake(s: GameState, boulder: Body): void {
  for (const b of s.bodies) {
    if (b === boulder || !b.alive) continue;
    const nx = b.x - boulder.x;
    const ny = b.y - boulder.y;
    const d = fx.sqrt(fx.mul(nx, nx) + fx.mul(ny, ny));
    if (d === 0 || d >= T.QUAKE_RADIUS) continue;
    const fall = fx.div(T.QUAKE_RADIUS - d, T.QUAKE_RADIUS);
    const push = fx.div(fx.mul(fx.mul(T.QUAKE_FORCE, fall), HEROES[b.hero].kbTaken), b.mass);
    b.vx += fx.div(fx.mul(nx, push), d);
    b.vy += fx.div(fx.mul(ny, push), d);
  }
}

/** Vex — Effondrement : tire les ennemis proches vers elle au lieu de les repousser. */
function sinkhole(s: GameState, vex: Body): void {
  const mult = vex.actedLastTurn ? fx.ONE : T.SINKHOLE_STILL_BONUS;
  for (const b of s.bodies) {
    if (b === vex || !b.alive || b.owner === vex.owner) continue;
    const nx = b.x - vex.x;
    const ny = b.y - vex.y;
    const d = fx.sqrt(fx.mul(nx, nx) + fx.mul(ny, ny));
    if (d === 0 || d >= T.SINKHOLE_RADIUS) continue;
    const fall = fx.div(T.SINKHOLE_RADIUS - d, T.SINKHOLE_RADIUS);
    const pull = fx.mul(
      fx.div(fx.mul(fx.mul(T.SINKHOLE_FORCE, fall), HEROES[b.hero].kbTaken), b.mass),
      mult,
    );
    // vers Vex : direction opposée à la normale sortante (b - vex)
    b.vx -= fx.div(fx.mul(nx, pull), d);
    b.vy -= fx.div(fx.mul(ny, pull), d);
  }
}

/** Arc — Éclaboussure : un tir touché applique aussi une poussée radiale plus faible aux ennemis proches. */
function splashHit(s: GameState, p: Projectile, direct: Body): void {
  for (const b of s.bodies) {
    if (b === direct || !b.alive || b.owner === p.owner) continue;
    const nx = b.x - p.x;
    const ny = b.y - p.y;
    const d = fx.sqrt(fx.mul(nx, nx) + fx.mul(ny, ny));
    if (d === 0 || d >= p.splashRadius) continue;
    const fall = fx.div(p.splashRadius - d, p.splashRadius);
    const force = fx.mul(p.kb, T.ARC_SPLASH_FORCE_FRAC);
    const push = fx.div(fx.mul(fx.mul(force, fall), HEROES[b.hero].kbTaken), b.mass);
    b.vx += fx.div(fx.mul(nx, push), d);
    b.vy += fx.div(fx.mul(ny, push), d);
  }
}

function anchorToss(s: GameState, hook: Body, dirx: number, diry: number): void {
  let best: Body | null = null;
  let bestT = T.YANK_RANGE;
  for (const b of s.bodies) {
    if (!b.alive || b.owner === hook.owner) continue;
    const relx = b.x - hook.x;
    const rely = b.y - hook.y;
    const t = fx.mul(relx, dirx) + fx.mul(rely, diry);
    if (t <= 0 || t >= bestT) continue;
    const perpx = relx - fx.mul(dirx, t);
    const perpy = rely - fx.mul(diry, t);
    const perp = fx.sqrt(fx.mul(perpx, perpx) + fx.mul(perpy, perpy));
    if (perp <= b.radius + fx.fromInt(30)) {
      best = b;
      bestT = t;
    }
  }
  if (!best) return;
  const hx = hook.x - best.x;
  const hy = hook.y - best.y;
  const hd = fx.sqrt(fx.mul(hx, hx) + fx.mul(hy, hy));
  if (hd === 0) return;
  best.vx = fx.div(fx.mul(hx, T.YANK_PULL), hd);
  best.vy = fx.div(fx.mul(hy, T.YANK_PULL), hd);
}

function spawnWall(s: GameState, prism: Body, dirx: number, diry: number): void {
  const cx = prism.x + fx.mul(dirx, fx.fromInt(70));
  const cy = prism.y + fx.mul(diry, fx.fromInt(70));
  const px = -diry;
  const py = dirx;
  const half = fx.div(T.WALL_LEN, fx.fromInt(2));
  s.walls.push({
    x1: cx + fx.mul(px, half),
    y1: cy + fx.mul(py, half),
    x2: cx - fx.mul(px, half),
    y2: cy - fx.mul(py, half),
    restitution: T.WALL_RESTITUTION,
    turnsLeft: T.WALL_TURNS,
  });
}

function detonatePulse(s: GameState, p: Pulse): void {
  for (const b of s.bodies) {
    if (!b.alive) continue;
    const nx = b.x - p.x;
    const ny = b.y - p.y;
    const d = fx.sqrt(fx.mul(nx, nx) + fx.mul(ny, ny));
    if (d === 0 || d >= p.radius) continue;
    const fall = fx.div(p.radius - d, p.radius);
    const push = fx.div(fx.mul(fx.mul(p.force, fall), HEROES[b.hero].kbTaken), b.mass);
    b.vx += fx.div(fx.mul(nx, push), d);
    b.vy += fx.div(fx.mul(ny, push), d);
  }
}

function spawnProjectile(s: GameState, p: Projectile): void {
  s.projectiles.push(p);
}

function respawn(s: GameState, b: Body): void {
  const idx = s.bodies.filter((x) => x.owner === b.owner).indexOf(b);
  const pts = s.arena.spawn[b.owner];
  const p = pts[Math.min(idx, pts.length - 1)]!;
  b.x = p.x;
  b.y = p.y;
  b.vx = 0;
  b.vy = 0;
  b.alive = true;
  b.respawnIn = 0;
  b.charging = false;
  b.chargeDist = 0;
  b.intangible = false;
}
