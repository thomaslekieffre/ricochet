import { fx, HEROES, trig, tuning } from "../engine/index";
import type { Arena, Frame, GameState, HeroKind, Wall } from "../engine/index";

const WORLD_W = 1600;
export const VIEW_W = 960;
export const VIEW_H = 600;
const SCALE = VIEW_W / WORLD_W; // 0.6 (maps 1000 -> 600 too)

// DA « table de trajectoires » — cf. src/styles.css. Camps = paire vert / rose.
const P0 = "#d6ff3b"; // camp 0
const P1 = "#ff3e8f"; // camp 1
const INK = "#eef3ff";
const VOID = "#0a1f3d"; // contour sombre du texte sur canvas
const GOLD = "#ffb020"; // Momentum / capacités
const HAZARD = "#22d3c5"; // géométrie d'arène : murs, bumpers, tapis
const FIELD = "#0b2343";
const FIELD_EDGE = "#2b5a92";

const GLYPH: Record<HeroKind, string> = {
  boulder: "B",
  ram: "R",
  comet: "C",
  hook: "H",
  sling: "S",
  prism: "P",
};

/** A special-attack cast — drives the on-canvas name callout + bloom. */
export interface CastFx {
  x: number; // fixed
  y: number; // fixed
  owner: 0 | 1;
  name: string;
  hero: HeroKind;
  angleIdx: number;
  born: number; // performance.now() at cast
}

/** A radial shockwave — Boulder Quake, Prism Éclat detonation. */
export interface ShockFx {
  x: number; // fixed
  y: number; // fixed
  owner: 0 | 1;
  rMax: number; // fixed — final radius
  born: number;
}

export interface MatchView {
  state: GameState;
  phase: "select" | "aim" | "resolving" | "over";
  activeSide: 0 | 1;
  selectedId: number | null;
  aim: { x0: number; y0: number; x1: number; y1: number; power: number } | null;
  frame: Frame | null;
  shake: number;
  curtainFor: 0 | 1 | null;
  abilityArmed?: boolean;
  casts?: CastFx[];
  shocks?: ShockFx[];
  now?: number;
  reducedMotion?: boolean;
  castMs?: number;
  shockMs?: number;
}

const sx = (v: number): number => fx.toFloat(v) * SCALE;
const sc = (n: number): number => n * SCALE;

function rgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private projTrails: Array<Array<{ x: number; y: number }>> = [];

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D non supporté");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = VIEW_W * this.dpr;
    this.canvas.height = VIEW_H * this.dpr;
  }

  /** Pointer position (canvas CSS px) -> world fixed coordinates. */
  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const px = (clientX - r.left) * (VIEW_W / r.width);
    const py = (clientY - r.top) * (VIEW_W / r.width);
    return { x: fx.fromFloat(px / SCALE), y: fx.fromFloat(py / SCALE) };
  }

  draw(v: MatchView): void {
    const ctx = this.ctx;
    const s = v.state;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    ctx.save();
    if (v.shake > 0.01) {
      const m = 12 * v.shake;
      ctx.translate((Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m);
    }

    this.field(s);
    this.zone(s, v.frame);
    for (const w of s.walls) this.wall(w);
    for (const p of s.pulses) this.pulse(p);

    if (v.frame) {
      this.trails(v.frame);
      for (const p of v.frame.projectiles) this.projectile(p.x, p.y, p.owner);
      for (const b of v.frame.bodies) {
        if (!b.alive) continue;
        this.disc(sx(b.x), sx(b.y), b.owner, b.hero, b.charging, false, false);
      }
    } else {
      this.projTrails = [];
      // capacité armée mais aucun héros encore pris : halo ambre sur les héros
      // que tu peux lancer, pour dire « celui que tu prends utilisera la capacité ».
      const armPreview =
        v.abilityArmed === true &&
        v.selectedId === null &&
        v.phase === "select";
      for (const b of s.bodies) {
        if (!b.alive) {
          this.ghost(s, b.owner, b.id);
          continue;
        }
        const sel = b.id === v.selectedId;
        if (armPreview && b.owner === v.activeSide) {
          this.armRing(sx(b.x), sx(b.y), sc(fx.toFloat(HEROES[b.hero].radius)));
        }
        this.disc(
          sx(b.x),
          sx(b.y),
          b.owner,
          b.hero,
          false,
          sel,
          sel && v.abilityArmed === true,
        );
      }
      if (v.aim && v.phase === "aim" && !v.curtainFor) {
        const selBody =
          v.selectedId !== null
            ? s.bodies.find((b) => b.id === v.selectedId)
            : undefined;
        this.aim(v.aim, v.abilityArmed === true, selBody?.hero, s.arena);
      }
    }

    this.effects(v);

    ctx.restore();
  }

  private trails(frame: Frame): void {
    const ctx = this.ctx;
    const ps = frame.projectiles;
    for (let i = 0; i < ps.length; i++) {
      (this.projTrails[i] ??= []).push({ x: ps[i]!.x, y: ps[i]!.y });
      if (this.projTrails[i]!.length > 12) this.projTrails[i]!.shift();
    }
    this.projTrails.length = ps.length;

    for (let i = 0; i < ps.length; i++) {
      const tr = this.projTrails[i]!;
      const col = ps[i]!.owner === 0 ? P0 : P1;
      for (let k = 1; k < tr.length; k++) {
        const a = k / tr.length;
        ctx.beginPath();
        ctx.moveTo(sx(tr[k - 1]!.x), sx(tr[k - 1]!.y));
        ctx.lineTo(sx(tr[k]!.x), sx(tr[k]!.y));
        ctx.strokeStyle = rgba(col, a * 0.7);
        ctx.lineWidth = a * 6;
        ctx.lineCap = "round";
        ctx.stroke();
      }
    }
    ctx.lineCap = "butt";
  }

  private field(s: GameState): void {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(
      VIEW_W / 2,
      VIEW_H / 2,
      80,
      VIEW_W / 2,
      VIEW_H / 2,
      VIEW_W * 0.62,
    );
    g.addColorStop(0, "#123e73");
    g.addColorStop(1, FIELD);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.strokeStyle = FIELD_EDGE;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, VIEW_W - 4, VIEW_H - 4);
    ctx.strokeStyle = "rgba(238,243,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2, 20);
    ctx.lineTo(VIEW_W / 2, VIEW_H - 20);
    ctx.stroke();

    for (const c of s.arena.conveyors) {
      ctx.fillStyle = "rgba(34,211,197,0.12)";
      ctx.fillRect(sx(c.x), sx(c.y), sx(c.w), sx(c.h));
    }
    for (const bump of s.arena.bumpers) {
      ctx.beginPath();
      ctx.arc(sx(bump.x), sx(bump.y), sc(fx.toFloat(bump.radius)), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(34,211,197,0.20)";
      ctx.fill();
      ctx.strokeStyle = HAZARD;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private zone(s: GameState, frame: Frame | null): void {
    const ctx = this.ctx;
    const z = s.arena.zone;
    const ctrl = frame ? frame.control : this.liveControl(s);
    const fill =
      ctrl === 0
        ? "rgba(214,255,59,0.18)"
        : ctrl === 1
          ? "rgba(255,62,143,0.18)"
          : "rgba(34,211,197,0.12)";
    ctx.beginPath();
    ctx.arc(sx(z.x), sx(z.y), sc(fx.toFloat(z.r)), 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle =
      ctrl === 0 ? P0 : ctrl === 1 ? P1 : "rgba(34,211,197,0.7)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private liveControl(s: GameState): -1 | 0 | 1 {
    let a = 0;
    let b = 0;
    const z = s.arena.zone;
    const r2 = fx.toFloat(z.r) ** 2;
    for (const body of s.bodies) {
      if (!body.alive) continue;
      const d2 =
        (fx.toFloat(body.x - z.x)) ** 2 + (fx.toFloat(body.y - z.y)) ** 2;
      if (d2 > r2) continue;
      if (body.owner === 0) a++;
      else b++;
    }
    return a > b ? 0 : b > a ? 1 : -1;
  }

  private disc(
    px: number,
    py: number,
    owner: 0 | 1,
    hero: HeroKind,
    charging: boolean,
    selected: boolean,
    armed: boolean,
  ): void {
    const ctx = this.ctx;
    const col = owner === 0 ? P0 : P1;
    const r = sc(fx.toFloat(HEROES[hero].radius));

    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = charging ? 26 : 12;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();

    // rim
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (charging) {
      ctx.beginPath();
      ctx.arc(px, py, r + 7, 0, Math.PI * 2);
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (selected) {
      ctx.beginPath();
      ctx.arc(px, py, r + 10, 0, Math.PI * 2);
      ctx.strokeStyle = armed ? GOLD : INK;
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (armed) {
        ctx.beginPath();
        ctx.arc(px, py, r + 16, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(GOLD, 0.45);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // sur le vert, le glyphe doit être sombre pour rester lisible
    ctx.fillStyle = owner === 0 ? "rgba(10,31,61,0.92)" : "rgba(255,255,255,0.92)";
    ctx.font = `700 ${Math.round(r * 0.95)}px 'Bricolage Grotesque', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(GLYPH[hero], px, py + 1);
  }

  /** Anneau ambre pointillé : « ce héros lancera la capacité armée ». */
  private armRing(px: number, py: number, r: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, r + 6, 0, Math.PI * 2);
    ctx.strokeStyle = GOLD;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.restore();
  }

  private ghost(s: GameState, owner: 0 | 1, id: number): void {
    const ctx = this.ctx;
    const idx = s.bodies.filter((x) => x.owner === owner).findIndex((x) => x.id === id);
    const pts = s.arena.spawn[owner];
    const p = pts[Math.min(idx, pts.length - 1)]!;
    ctx.beginPath();
    ctx.arc(sx(p.x), sx(p.y), 22, 0, Math.PI * 2);
    ctx.strokeStyle = owner === 0 ? P0 : P1;
    ctx.globalAlpha = 0.3;
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  private wall(w: Wall): void {
    const ctx = this.ctx;
    const temp = w.turnsLeft >= 0; // Prism barrier vs permanent arena geometry
    ctx.beginPath();
    ctx.moveTo(sx(w.x1), sx(w.y1));
    ctx.lineTo(sx(w.x2), sx(w.y2));
    ctx.lineCap = "round";
    if (temp) {
      ctx.save();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 5;
      ctx.setLineDash([11, 7]);
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.restore();
      for (const [ex, ey] of [
        [w.x1, w.y1],
        [w.x2, w.y2],
      ] as const) {
        ctx.beginPath();
        ctx.arc(sx(ex), sx(ey), 4, 0, Math.PI * 2);
        ctx.fillStyle = GOLD;
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = HAZARD;
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  private pulse(p: { x: number; y: number; radius: number }): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(sx(p.x), sx(p.y), sc(fx.toFloat(p.radius)), 0, Math.PI * 2);
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = "rgba(255,176,32,0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    // a small pip at the centre so a pending Éclat reads as a live threat
    ctx.beginPath();
    ctx.arc(sx(p.x), sx(p.y), 5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,176,32,0.9)";
    ctx.fill();
  }

  private projectile(x: number, y: number, owner: 0 | 1): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowColor = owner === 0 ? P0 : P1;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(sx(x), sx(y), 6, 0, Math.PI * 2);
    ctx.fillStyle = owner === 0 ? P0 : P1;
    ctx.fill();
    ctx.restore();
  }

  private aim(
    a: NonNullable<MatchView["aim"]>,
    armed = false,
    hero?: HeroKind,
    arena?: Arena,
  ): void {
    const ctx = this.ctx;
    const x0 = sc(fx.toFloat(a.x0));
    const y0 = sc(fx.toFloat(a.y0));
    const power = Math.max(0, Math.min(a.power, 1));

    // direction quantifiée exactement comme le solveur (table de sinus figée)
    const idx = trig.angleToIdx(
      Math.atan2(fx.toFloat(a.y1 - a.y0), fx.toFloat(a.x1 - a.x0)),
    );
    const dirx = fx.toFloat(trig.cosIdx(idx));
    const diry = fx.toFloat(trig.sinIdx(idx));

    // point d'arrêt prévu sur terrain vide : impulsion (launchBase + power·launchPower)
    // puis friction exponentielle → distance = DT/(1-FRICTION) · (v0 - STOP_EPS).
    let exW = fx.toFloat(a.x1);
    let eyW = fx.toFloat(a.y1);
    if (hero) {
      const def = HEROES[hero];
      const v0 = fx.toFloat(def.launchBase) + fx.toFloat(def.launchPower) * power;
      const dt = fx.toFloat(tuning.DT);
      const fr = fx.toFloat(tuning.FRICTION);
      const eps = fx.toFloat(tuning.STOP_EPS);
      const reach = (dt / (1 - fr)) * Math.max(0, v0 - eps);
      exW = fx.toFloat(a.x0) + dirx * reach;
      eyW = fx.toFloat(a.y0) + diry * reach;
    }
    const ex = exW * SCALE;
    const ey = eyW * SCALE;

    const outOfBounds =
      arena !== undefined &&
      (exW < 0 ||
        exW > fx.toFloat(arena.w) ||
        eyW < 0 ||
        eyW > fx.toFloat(arena.h));
    // priorité : sortie de terrain (danger) > capacité armée (ambre) > normal
    const guide = outOfBounds ? "#ff3e8f" : armed ? GOLD : INK;

    // ligne de visée jusqu'au point d'arrêt prévu
    ctx.save();
    ctx.strokeStyle = guide;
    ctx.lineWidth = armed || outOfBounds ? 4 : 3;
    ctx.globalAlpha = 0.9;
    if (armed && !outOfBounds) {
      ctx.shadowColor = GOLD;
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.restore();

    // pointe de flèche au point d'arrêt
    const ang = Math.atan2(ey - y0, ex - x0);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 15 * Math.cos(ang - 0.4), ey - 15 * Math.sin(ang - 0.4));
    ctx.lineTo(ex - 15 * Math.cos(ang + 0.4), ey - 15 * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fillStyle = guide;
    ctx.fill();

    // fantôme du héros là où il s'immobilisera
    if (hero) {
      const gr = sc(fx.toFloat(HEROES[hero].radius));
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = guide;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(ex, ey, gr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = rgba(guide, 0.1);
      ctx.fill();
      ctx.restore();
    }

    // jauge de puissance autour du héros
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x0, y0, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * power);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  // ---- special-attack feedback -------------------------------------------

  private effects(v: MatchView): void {
    const ctx = this.ctx;
    const casts = v.casts ?? [];
    const shocks = v.shocks ?? [];
    if (casts.length === 0 && shocks.length === 0) return;
    const now = v.now ?? performance.now();
    const castMs = v.castMs ?? 750;
    const shockMs = v.shockMs ?? 520;

    for (const s of shocks) {
      const p = (now - s.born) / shockMs;
      if (p < 0 || p >= 1) continue;
      const cx = sx(s.x);
      const cy = sx(s.y);
      const rMax = sc(fx.toFloat(s.rMax));
      const col = s.owner === 0 ? P0 : P1;
      const ease = 1 - (1 - p) * (1 - p);
      ctx.beginPath();
      ctx.arc(cx, cy, rMax * ease, 0, Math.PI * 2);
      ctx.fillStyle = rgba(col, 0.16 * (1 - p));
      ctx.fill();
      for (let k = 0; k < 3; k++) {
        const rp = ease + k * 0.14;
        if (rp >= 1) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, rMax * rp, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(col, (1 - rp) * 0.9);
        ctx.lineWidth = 3 - k;
        ctx.stroke();
      }
    }

    for (const c of casts) {
      const p = (now - c.born) / castMs;
      if (p < 0 || p >= 1) continue;
      const cx = sx(c.x);
      const cy = sx(c.y);
      const col = c.owner === 0 ? P0 : P1;

      if (p < 0.5) {
        const bp = p / 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 18 + bp * 62, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(col, (1 - bp) * 0.8);
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      if (c.hero === "hook" && p < 0.6) {
        const dx = fx.toFloat(trig.cosIdx(c.angleIdx));
        const dy = fx.toFloat(trig.sinIdx(c.angleIdx));
        const len = sc(fx.toFloat(tuning.YANK_RANGE));
        ctx.save();
        ctx.strokeStyle = rgba(col, (1 - p / 0.6) * 0.7);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + dx * len, cy + dy * len);
        ctx.stroke();
        ctx.restore();
      }

      const rise = v.reducedMotion === true ? 0 : p * 32;
      const alpha = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
      ctx.save();
      ctx.font = "700 20px 'Bricolage Grotesque', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = 4;
      const ty = cy - 44 - rise;
      ctx.strokeStyle = rgba(VOID, alpha * 0.95);
      ctx.strokeText(c.name.toUpperCase(), cx, ty);
      ctx.fillStyle = rgba(col, alpha);
      ctx.fillText(c.name.toUpperCase(), cx, ty);
      ctx.restore();
    }

    if (v.reducedMotion !== true) {
      let recent: { born: number; owner: 0 | 1 } | null = null;
      for (const e of [...casts, ...shocks]) {
        if (!recent || e.born > recent.born) recent = e;
      }
      if (recent) {
        const age = now - recent.born;
        if (age >= 0 && age < 260) {
          const a = (1 - age / 260) * 0.5;
          const col = recent.owner === 0 ? P0 : P1;
          const g = ctx.createRadialGradient(
            VIEW_W / 2,
            VIEW_H / 2,
            VIEW_W * 0.3,
            VIEW_W / 2,
            VIEW_H / 2,
            VIEW_W * 0.62,
          );
          g.addColorStop(0, "rgba(0,0,0,0)");
          g.addColorStop(1, rgba(col, a));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, VIEW_W, VIEW_H);
        }
      }
    }
  }
}
