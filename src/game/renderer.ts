import * as PIXI from "pixi.js";
import { fx, HEROES, trig, tuning } from "../engine/index";
import type { Arena, Archetype, Frame, GameState, HeroKind, Wall } from "../engine/index";

import arcUrl from "../assets/heroes/arc.png";
import boulderUrl from "../assets/heroes/boulder.png";
import boulderHitUrl from "../assets/heroes/boulder_hit.png";
import boulderKoUrl from "../assets/heroes/boulder_ko.png";
import cometUrl from "../assets/heroes/comet.png";
import cometHitUrl from "../assets/heroes/comet_hit.png";
import cometKoUrl from "../assets/heroes/comet_ko.png";
import hookUrl from "../assets/heroes/hook.png";
import prismUrl from "../assets/heroes/prism.png";
import ramUrl from "../assets/heroes/ram.png";
import slingUrl from "../assets/heroes/sling.png";
import vexUrl from "../assets/heroes/vex.png";

type SpriteVariant = "idle" | "hit" | "ko";

/**
 * Sprites générés (fond transparent) par héros — cf. docs/PHASES.md P2.
 * `hit`/`ko` sont optionnels : déploiement héros par héros, fallback sur
 * `idle` tant qu'une pose dédiée n'existe pas.
 */
const SPRITE_URL: Record<HeroKind, { idle: string; hit?: string; ko?: string }> = {
  boulder: { idle: boulderUrl, hit: boulderHitUrl, ko: boulderKoUrl },
  ram: { idle: ramUrl },
  comet: { idle: cometUrl, hit: cometHitUrl, ko: cometKoUrl },
  hook: { idle: hookUrl },
  sling: { idle: slingUrl },
  prism: { idle: prismUrl },
  vex: { idle: vexUrl },
  arc: { idle: arcUrl },
};

const WORLD_W = 1600;
export const VIEW_W = 960;
export const VIEW_H = 600;
const SCALE = VIEW_W / WORLD_W; // 0.6 (maps 1000 -> 600 too)

// DA « table de trajectoires » — cf. src/styles.css. Camps = paire vert / rose.
const P0 = 0xd6ff3b; // camp 0
const P1 = 0xff3e8f; // camp 1
const INK = 0xeef3ff;
const VOID = 0x0a1f3d; // contour sombre du texte
const GOLD = 0xffb020; // Momentum / capacités
const HAZARD = 0x22d3c5; // géométrie d'arène : murs, bumpers, tapis
// Le terrain lui-même est un tapis chaud (table de jeu physique, cf. BUMP!
// Superbrawl) — contraste volontaire avec le cobalt sombre du reste de
// l'appli (menus, fond) : à l'intérieur de la mallette (#stagewrap), on est
// posé sur une vraie table de jeu éclairée, pas dans le même bleu nuit.
const FIELD = 0xdba75a;
const FIELD_CENTER = 0xf3d998;
const FIELD_EDGE = 0x7a4a20;

const GLYPH: Record<HeroKind, string> = {
  boulder: "B",
  ram: "R",
  comet: "C",
  hook: "H",
  sling: "S",
  prism: "P",
  vex: "V",
  arc: "A",
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
const col = (owner: 0 | 1): number => (owner === 0 ? P0 : P1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ---- silhouettes par archétype (points unitaires, mis à l'échelle du rayon) --

function archPoints(archetype: Archetype, r: number): number[] {
  switch (archetype) {
    case "brawler": {
      // octogone trapu
      const pts: number[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        pts.push(Math.cos(a) * r * 1.06, Math.sin(a) * r * 1.06);
      }
      return pts;
    }
    case "dasher": {
      // losange étiré — évoque la vitesse
      return [0, -r * 1.2, r * 0.86, 0, 0, r * 1.2, -r * 0.86, 0];
    }
    case "sniper": {
      // hexagone taillé
      const pts: number[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        pts.push(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05);
      }
      return pts;
    }
    case "mage": {
      // étoile à 6 branches (cristal)
      const pts: number[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r * 1.18 : r * 0.62;
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      return pts;
    }
  }
}

/** Approxime un trait pointillé : segments droits alternés le long d'un cercle. */
function dashedCircle(
  g: PIXI.Graphics,
  cx: number,
  cy: number,
  r: number,
  width: number,
  color: number,
  alpha: number,
  dash = 8,
  gap = 8,
): void {
  const circ = Math.max(1, 2 * Math.PI * r);
  const steps = Math.max(8, Math.floor(circ / (dash + gap)));
  const step = (Math.PI * 2) / steps;
  const dashFrac = dash / (dash + gap);
  g.lineStyle(width, color, alpha);
  for (let i = 0; i < steps; i++) {
    const a0 = i * step;
    const a1 = a0 + step * dashFrac;
    g.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    g.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
  }
}

/** Halo doux approximant un shadowBlur — anneaux concentriques d'alpha décroissante. */
function glow(g: PIXI.Graphics, cx: number, cy: number, r: number, color: number, strength: number): void {
  const rings = 4;
  for (let i = rings; i >= 1; i--) {
    const rr = r + (i / rings) * r * 0.9;
    const a = (strength * (1 - i / (rings + 1))) / rings;
    g.beginFill(color, a);
    g.drawCircle(cx, cy, rr);
    g.endFill();
  }
}

interface BodyVisual {
  container: PIXI.Container;
  shadow: PIXI.Graphics;
  glowG: PIXI.Graphics;
  base: PIXI.Graphics;
  sprite: PIXI.Sprite;
  ring: PIXI.Graphics;
  label: PIXI.Text;
  trail: PIXI.Graphics;
  trailPts: Array<{ x: number; y: number }>;
  hero: HeroKind | null;
  lastX: number;
  lastY: number;
  lastAlive: boolean;
  lastSpeed: number;
  poofUntil: number; // performance.now() deadline of a KO poof-out, 0 == none
  spawnAt: number; // performance.now() of last alive-false->true transition, for pop-in
  hitUntil: number; // performance.now() deadline of the "hit" pose sprite, 0 == none
}

interface Particle {
  gfx: PIXI.Graphics;
  vx: number;
  vy: number;
  born: number;
  life: number; // ms
  r: number;
  color: number;
}

/** Flash de choc ou de KO — lisibilité de « qui vient de se faire toucher ». */
interface ImpactMark {
  x: number;
  y: number;
  r: number; // rayon du héros touché, pour dimensionner l'anneau
  color: number;
  born: number;
  ko: boolean; // KO = anneau plus grand, plus clair, plus long
}

const IMPACT_SPEED_MIN = 90; // world units/sec — en dessous, pas un vrai choc
const IMPACT_DROP_RATIO = 0.4; // vitesse tombée sous 40% de la précédente == choc

export class Renderer {
  private app: PIXI.Application;
  private root = new PIXI.Container();
  private fieldG = new PIXI.Graphics();
  private zoneG = new PIXI.Graphics();
  // marqueur de zone façon "jeton physique" (cf. BUMP! Superbrawl) — posé une
  // fois en enfant de zoneG, `zoneG.clear()` ne retire pas les enfants.
  private zoneMarker = new PIXI.Text("💀", { fontSize: 26 });
  private wallsG = new PIXI.Graphics();
  private pulsesG = new PIXI.Graphics();
  private trailsG = new PIXI.Graphics(); // trainées des projectiles
  private projG = new PIXI.Graphics();
  private bodiesLayer = new PIXI.Container();
  private particlesLayer = new PIXI.Container();
  private fxG = new PIXI.Graphics(); // ligne de visée en cours
  private effectsG = new PIXI.Graphics(); // ondes de choc / callouts de capacité
  private impactG = new PIXI.Graphics(); // flash de choc / KO — lisibilité "qui se fait toucher"
  private fxTextLayer = new PIXI.Container();
  private vignetteG = new PIXI.Graphics();

  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  private projTrails: Array<Array<{ x: number; y: number }>> = [];
  private bodies = new Map<number, BodyVisual>();
  private particles: Particle[] = [];
  private impacts: ImpactMark[] = [];
  private castTexts = new Map<CastFx, PIXI.Text>();
  private heroTextures = new Map<string, PIXI.Texture>();
  private onResize = (): void => this.resize();

  /** Texture d'un héros pour une pose donnée, chargée et mise en cache à la demande. */
  private heroTexture(hero: HeroKind, variant: SpriteVariant = "idle"): PIXI.Texture {
    const urls = SPRITE_URL[hero];
    const url = (variant === "hit" ? urls.hit : variant === "ko" ? urls.ko : undefined) ?? urls.idle;
    const key = `${hero}:${url}`;
    let tex = this.heroTextures.get(key);
    if (!tex) {
      tex = PIXI.Texture.from(url);
      this.heroTextures.set(key, tex);
    }
    return tex;
  }

  /** Applique une texture de héros au sprite, en redimensionnant selon son aspect ratio propre. */
  private setBodySprite(bv: BodyVisual, tex: PIXI.Texture, r: number): void {
    bv.sprite.texture = tex;
    const applySpriteSize = (): void => {
      const aspect = tex.height > 0 && tex.width > 0 ? tex.height / tex.width : 1;
      const w = r * 2.3;
      bv.sprite.width = w;
      bv.sprite.height = w * aspect;
      bv.sprite.y = -r * 0.15; // recentre visuellement (les sprites ont du vide en pied)
    };
    if (tex.valid) applySpriteSize();
    else tex.baseTexture.once("loaded", applySpriteSize);
  }

  /** Le canvas WebGL, créé frais à chaque session (cf. commentaire de la classe). */
  private readonly canvas: HTMLCanvasElement;

  constructor(host: HTMLElement) {
    // Un canvas neuf par session plutôt qu'un canvas partagé réutilisé : la
    // perte de contexte WebGL déclenchée par `app.destroy()` est asynchrone
    // côté navigateur, donc recréer un contexte sur le MÊME canvas juste
    // après peut retomber sur un contexte encore "en cours de perte"
    // (`checkMaxIfStatementsInShader` renvoie alors 0 — bug constaté en
    // testant les étapes précédentes du plan de migration). Un canvas neuf
    // n'a jamais eu de contexte : la création est toujours propre.
    this.canvas = document.createElement("canvas");
    this.canvas.id = "stage";
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    host.appendChild(this.canvas);
    this.zoneMarker.anchor.set(0.5);
    this.zoneG.addChild(this.zoneMarker);
    this.app = new PIXI.Application({
      view: this.canvas,
      width: VIEW_W,
      height: VIEW_H,
      backgroundColor: FIELD,
      antialias: true,
      autoDensity: false,
    });
    this.root.addChild(
      this.fieldG,
      this.zoneG,
      this.wallsG,
      this.pulsesG,
      this.trailsG,
      this.projG,
      this.bodiesLayer,
      this.particlesLayer,
      this.impactG,
      this.fxG,
      this.effectsG,
      this.fxTextLayer,
      this.vignetteG,
    );
    this.app.stage.addChild(this.root);
    this.resize();
    window.addEventListener("resize", this.onResize);
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.app.renderer.resolution = this.dpr;
    this.app.renderer.resize(VIEW_W, VIEW_H);
  }

  /** Le canvas WebGL réellement créé (pour le binding d'événements côté appelant). */
  get view(): HTMLCanvasElement {
    return this.canvas;
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.app.destroy(false, { children: true, texture: true });
    this.canvas.remove();
  }

  /** Pointer position (canvas CSS px) -> world fixed coordinates. */
  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const px = (clientX - r.left) * (VIEW_W / r.width);
    const py = (clientY - r.top) * (VIEW_W / r.width);
    return { x: fx.fromFloat(px / SCALE), y: fx.fromFloat(py / SCALE) };
  }

  draw(v: MatchView): void {
    const s = v.state;
    const now = v.now ?? performance.now();

    const m = v.shake > 0.01 ? 12 * v.shake : 0;
    this.root.position.set(m ? (Math.random() * 2 - 1) * m : 0, m ? (Math.random() * 2 - 1) * m : 0);

    this.field(s);
    this.zone(s, v.frame);
    this.walls(s.walls);
    this.pulses(s.pulses);

    const seen = new Set<number>();

    if (v.frame) {
      this.projectileTrails(v.frame);
      this.projectiles(v.frame);
      for (const b of v.frame.bodies) {
        seen.add(b.id);
        this.syncBody(b.id, b.owner, b.hero, sx(b.x), sx(b.y), b.alive, b.charging, false, false, now);
      }
    } else {
      this.projTrails = [];
      this.projG.clear();
      this.trailsG.clear();
      const armPreview = v.abilityArmed === true && v.selectedId === null && v.phase === "select";
      for (const b of s.bodies) {
        seen.add(b.id);
        if (!b.alive) {
          this.ghostSpawn(s, b.owner, b.id);
          this.syncBody(b.id, b.owner, b.hero, sx(b.x), sx(b.y), false, false, false, false, now);
          continue;
        }
        const sel = b.id === v.selectedId;
        const armedHere = armPreview && b.owner === v.activeSide;
        const cooling =
          b.owner === v.activeSide &&
          b.acting &&
          (v.phase === "select" || v.phase === "aim");
        this.syncBody(b.id, b.owner, b.hero, sx(b.x), sx(b.y), true, false, sel, sel && v.abilityArmed === true, now, armedHere, cooling);
      }
      if (v.aim && v.phase === "aim" && !v.curtainFor) {
        const selBody = v.selectedId !== null ? s.bodies.find((b) => b.id === v.selectedId) : undefined;
        this.aim(v.aim, v.abilityArmed === true, selBody?.hero, s.arena);
      } else {
        this.fxG.clear();
      }
    }

    // masque/retire les visuels des héros qui n'apparaissent plus cette frame
    for (const [id, bv] of this.bodies) {
      if (!seen.has(id)) bv.container.visible = false;
    }

    this.tickParticles(now);
    this.renderImpacts(now);
    this.effects(v, now);
  }

  // ---- décor -----------------------------------------------------------

  private field(s: GameState): void {
    const g = this.fieldG;
    g.clear();
    g.beginFill(FIELD, 1);
    g.drawRect(-4, -4, VIEW_W + 8, VIEW_H + 8);
    g.endFill();
    const rings = 5;
    for (let i = rings; i >= 0; i--) {
      const t = i / rings;
      const rr = 80 + t * (VIEW_W * 0.62 - 80);
      const c = lerpColor(FIELD_CENTER, FIELD, 1 - t);
      g.beginFill(c, 1);
      g.drawCircle(VIEW_W / 2, VIEW_H / 2, rr);
      g.endFill();
    }
    g.lineStyle(6, FIELD_EDGE, 1);
    g.drawRect(3, 3, VIEW_W - 6, VIEW_H - 6);
    g.lineStyle(1, FIELD_EDGE, 0.18);
    g.moveTo(VIEW_W / 2, 20);
    g.lineTo(VIEW_W / 2, VIEW_H - 20);

    for (const c of s.arena.conveyors) {
      g.beginFill(HAZARD, 0.12);
      g.drawRect(sx(c.x), sx(c.y), sx(c.w), sx(c.h));
      g.endFill();
    }
    for (const bump of s.arena.bumpers) {
      g.beginFill(HAZARD, 0.2);
      g.drawCircle(sx(bump.x), sx(bump.y), sc(fx.toFloat(bump.radius)));
      g.endFill();
      g.lineStyle(2, HAZARD, 1);
      g.drawCircle(sx(bump.x), sx(bump.y), sc(fx.toFloat(bump.radius)));
    }
  }

  private zone(s: GameState, frame: Frame | null): void {
    const g = this.zoneG;
    g.clear();
    const z = s.arena.zone;
    const ctrl = frame ? frame.control : this.liveControl(s);
    const fillCol = ctrl === 0 ? P0 : ctrl === 1 ? P1 : HAZARD;
    const fillA = ctrl === -1 ? 0.12 : 0.18;
    g.beginFill(fillCol, fillA);
    g.drawCircle(sx(z.x), sx(z.y), sc(fx.toFloat(z.r)));
    g.endFill();
    dashedCircle(g, sx(z.x), sx(z.y), sc(fx.toFloat(z.r)), 3, ctrl === -1 ? HAZARD : fillCol, ctrl === -1 ? 0.7 : 1, 8, 8);
    this.zoneMarker.x = sx(z.x);
    this.zoneMarker.y = sx(z.y);
    this.zoneMarker.alpha = ctrl === -1 ? 0.5 : 0.85;
  }

  private liveControl(s: GameState): -1 | 0 | 1 {
    let a = 0;
    let b = 0;
    const z = s.arena.zone;
    const r2 = fx.toFloat(z.r) ** 2;
    for (const body of s.bodies) {
      if (!body.alive) continue;
      const d2 = fx.toFloat(body.x - z.x) ** 2 + fx.toFloat(body.y - z.y) ** 2;
      if (d2 > r2) continue;
      if (body.owner === 0) a++;
      else b++;
    }
    return a > b ? 0 : b > a ? 1 : -1;
  }

  private walls(walls: Wall[]): void {
    const g = this.wallsG;
    g.clear();
    for (const w of walls) {
      const temp = w.turnsLeft >= 0;
      const x1 = sx(w.x1);
      const y1 = sx(w.y1);
      const x2 = sx(w.x2);
      const y2 = sx(w.y2);
      if (temp) {
        glow(g, (x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1) / 2, GOLD, 0.12);
        const len = Math.hypot(x2 - x1, y2 - y1);
        const dash = 11;
        const gap = 7;
        const steps = Math.max(1, Math.floor(len / (dash + gap)));
        const ux = (x2 - x1) / len;
        const uy = (y2 - y1) / len;
        g.lineStyle(5, GOLD, 1);
        for (let i = 0; i < steps; i++) {
          const t0 = (i * (dash + gap)) / len;
          const t1 = Math.min(1, t0 + dash / len);
          g.moveTo(x1 + ux * len * t0, y1 + uy * len * t0);
          g.lineTo(x1 + ux * len * t1, y1 + uy * len * t1);
        }
        g.beginFill(GOLD, 1);
        g.drawCircle(x1, y1, 4);
        g.drawCircle(x2, y2, 4);
        g.endFill();
      } else {
        g.lineStyle(6, HAZARD, 1);
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
      }
    }
  }

  private pulses(pulses: GameState["pulses"]): void {
    const g = this.pulsesG;
    g.clear();
    for (const p of pulses) {
      dashedCircle(g, sx(p.x), sx(p.y), sc(fx.toFloat(p.radius)), 2, GOLD, 0.7, 3, 6);
      g.beginFill(GOLD, 0.9);
      g.drawCircle(sx(p.x), sx(p.y), 5);
      g.endFill();
    }
  }

  private ghostSpawn(s: GameState, owner: 0 | 1, id: number): void {
    const idx = s.bodies.filter((x) => x.owner === owner).findIndex((x) => x.id === id);
    const pts = s.arena.spawn[owner];
    const p = pts[Math.min(idx, pts.length - 1)]!;
    dashedCircle(this.wallsG, sx(p.x), sx(p.y), 22, 2, col(owner), 0.3, 4, 5);
  }

  // ---- projectiles -------------------------------------------------------

  private projectileTrails(frame: Frame): void {
    const g = this.trailsG;
    g.clear();
    const ps = frame.projectiles;
    for (let i = 0; i < ps.length; i++) {
      (this.projTrails[i] ??= []).push({ x: ps[i]!.x, y: ps[i]!.y });
      if (this.projTrails[i]!.length > 12) this.projTrails[i]!.shift();
    }
    this.projTrails.length = ps.length;

    for (let i = 0; i < ps.length; i++) {
      const tr = this.projTrails[i]!;
      const c = col(ps[i]!.owner);
      for (let k = 1; k < tr.length; k++) {
        const a = k / tr.length;
        g.lineStyle(a * 6, c, a * 0.7);
        g.moveTo(sx(tr[k - 1]!.x), sx(tr[k - 1]!.y));
        g.lineTo(sx(tr[k]!.x), sx(tr[k]!.y));
      }
    }
  }

  private projectiles(frame: Frame): void {
    const g = this.projG;
    g.clear();
    for (const p of frame.projectiles) {
      const c = col(p.owner);
      glow(g, sx(p.x), sx(p.y), 6, c, 0.5);
      g.beginFill(c, 1);
      g.drawCircle(sx(p.x), sx(p.y), 6);
      g.endFill();
    }
  }

  // ---- héros : visuels persistants (permet squash/stretch + particules) --

  private makeBodyVisual(): BodyVisual {
    const container = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    const glowG = new PIXI.Graphics();
    const base = new PIXI.Graphics(); // socle coloré par camp, sous le sprite
    const sprite = new PIXI.Sprite();
    sprite.anchor.set(0.5, 0.5);
    const ring = new PIXI.Graphics();
    const trail = new PIXI.Graphics();
    const label = new PIXI.Text("", {
      fontFamily: "Bricolage Grotesque, sans-serif",
      fontWeight: "700",
      fontSize: 16,
      fill: 0xffffff,
      align: "center",
    });
    label.anchor.set(0.5, 0.5);
    container.addChild(shadow, glowG, base, sprite, ring, label);
    this.bodiesLayer.addChild(trail, container);
    return {
      container,
      shadow,
      glowG,
      base,
      sprite,
      ring,
      label,
      trail,
      trailPts: [],
      hero: null,
      lastX: 0,
      lastY: 0,
      lastAlive: true,
      lastSpeed: 0,
      poofUntil: 0,
      spawnAt: 0,
      hitUntil: 0,
    };
  }

  private syncBody(
    id: number,
    owner: 0 | 1,
    hero: HeroKind,
    px: number,
    py: number,
    alive: boolean,
    charging: boolean,
    selected: boolean,
    armed: boolean,
    now: number,
    armPreview = false,
    cooling = false,
  ): void {
    let bv = this.bodies.get(id);
    if (!bv) {
      bv = this.makeBodyVisual();
      bv.lastX = px;
      bv.lastY = py;
      bv.hero = null;
      this.bodies.set(id, bv);
    }
    bv.container.visible = alive || now < bv.poofUntil;
    const r = sc(fx.toFloat(HEROES[hero].radius));

    if (!alive) {
      if (bv.lastAlive) {
        // KO à l'instant : petite explosion de débris + poof + flash net —
        // c'est LE moment où il faut que ce soit évident que ce corps sort.
        this.burst(bv.lastX, bv.lastY, col(owner), 14);
        this.impacts.push({ x: bv.lastX, y: bv.lastY, r, color: col(owner), born: now, ko: true });
        bv.poofUntil = now + 260;
        this.setBodySprite(bv, this.heroTexture(hero, "ko"), r);
      }
      bv.lastAlive = false;
      bv.trailPts = [];
      bv.trail.clear();
      if (now < bv.poofUntil) {
        const p = 1 - (bv.poofUntil - now) / 260;
        bv.container.alpha = 1 - p;
        bv.container.scale.set(1 + p * 0.6);
      }
      return;
    }
    if (!bv.lastAlive) {
      bv.spawnAt = now; // ressuscite : pop-in
      bv.hitUntil = 0;
      if (bv.hero === hero) this.setBodySprite(bv, this.heroTexture(hero), r);
    }
    bv.lastAlive = true;
    bv.container.alpha = 1;

    const c = col(owner);
    const archetype = HEROES[hero].archetype;

    // choc : la vitesse instantanée chute brutalement -> squash + débris
    const dx = px - bv.lastX;
    const dy = py - bv.lastY;
    const speed = Math.hypot(dx, dy);
    if (bv.lastSpeed > IMPACT_SPEED_MIN && speed < bv.lastSpeed * IMPACT_DROP_RATIO) {
      this.burst(px, py, c, 8);
      this.impacts.push({ x: px, y: py, r, color: c, born: now, ko: false });
      bv.spawnAt = now; // relance l'anim de squash au point d'impact
      this.setBodySprite(bv, this.heroTexture(hero, "hit"), r);
      bv.hitUntil = now + 220;
    }
    bv.lastSpeed = speed;
    bv.lastX = px;
    bv.lastY = py;

    // traînée pour les dashers en pleine charge
    if (archetype === "dasher" && charging) {
      bv.trailPts.push({ x: px, y: py });
      if (bv.trailPts.length > 10) bv.trailPts.shift();
    } else if (bv.trailPts.length > 0) {
      bv.trailPts.shift();
    }
    bv.trail.clear();
    for (let k = 1; k < bv.trailPts.length; k++) {
      const a = k / bv.trailPts.length;
      bv.trail.lineStyle(a * (r * 0.7), c, a * 0.5);
      bv.trail.moveTo(bv.trailPts[k - 1]!.x, bv.trailPts[k - 1]!.y);
      bv.trail.lineTo(bv.trailPts[k]!.x, bv.trailPts[k]!.y);
    }

    bv.container.position.set(px, py);

    // squash/stretch : pop d'échelle qui se détend en ~180ms depuis spawnAt
    const since = now - bv.spawnAt;
    let sxScale = 1;
    let syScale = 1;
    if (since >= 0 && since < 180) {
      const p = since / 180;
      const ease = 1 - (1 - p) * (1 - p);
      const pop = (1 - ease) * 0.32;
      sxScale = 1 + pop;
      syScale = 1 - pop * 0.8;
    }
    // respiration légère au repos
    if (!charging && since >= 180) {
      const breathe = Math.sin(now / 450 + id) * 0.015;
      sxScale += breathe;
      syScale += breathe;
    }
    bv.container.scale.set(sxScale, syScale);

    if (bv.hero !== hero) {
      bv.hero = hero;
      // le sprite garde ses couleurs propres (pas de tint par camp — un rendu
      // sombre/clair selon le héros ne se teinterait pas de façon lisible) ;
      // le camp se lit au socle + au glow sous les pieds, cf. bv.base.
      this.setBodySprite(bv, this.heroTexture(hero), r);
      bv.label.text = GLYPH[hero];
      bv.label.style.fontSize = Math.round(r * 0.42);
      bv.label.style.fill = 0xffffff;
      bv.label.position.set(r * 0.68, r * 0.68);
    } else if (bv.hitUntil && now >= bv.hitUntil) {
      bv.hitUntil = 0;
      this.setBodySprite(bv, this.heroTexture(hero), r);
    }
    bv.label.alpha = 0.55;

    bv.shadow.clear();
    bv.shadow.beginFill(0x03070f, 0.35);
    bv.shadow.drawEllipse(3, r * 0.55, r * 0.9, r * 0.35);
    bv.shadow.endFill();

    bv.glowG.clear();
    glow(bv.glowG, 0, 0, r, c, charging ? 0.55 : 0.28);

    // socle : silhouette d'archétype aplatie sous les pieds, couleur de camp —
    // c'est elle qui porte l'identité vert/rose maintenant que le sprite garde
    // ses propres couleurs.
    bv.base.clear();
    bv.base.position.set(0, r * 0.68);
    bv.base.scale.set(1, 0.4);
    bv.base.lineStyle(2, 0xffffff, 0.4);
    bv.base.beginFill(c, 0.95);
    bv.base.drawPolygon(archPoints(archetype, r * 0.9));
    bv.base.endFill();

    bv.ring.clear();
    if (charging) {
      bv.ring.lineStyle(3, c, 0.5);
      bv.ring.drawCircle(0, 0, r + 7);
    }
    if (armPreview) {
      dashedCircle(bv.ring, 0, 0, r + 6, 2.5, GOLD, 0.85, 3, 5);
    }
    if (selected) {
      dashedCircle(bv.ring, 0, 0, r + 10, 3, armed ? GOLD : INK, 1, 4, 4);
      if (armed) {
        bv.ring.lineStyle(2, GOLD, 0.45);
        bv.ring.drawCircle(0, 0, r + 16);
      }
    }
    // en repos : a agi le tour précédent, indisponible ce tour-ci (rejouable au suivant)
    if (cooling) {
      bv.container.alpha = 0.45;
      dashedCircle(bv.ring, 0, 0, r + 6, 2, INK, 0.35, 2, 4);
    }
  }

  // ---- particules --------------------------------------------------------

  private burst(x: number, y: number, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 160;
      const gfx = new PIXI.Graphics();
      const r = 1.5 + Math.random() * 2.5;
      gfx.beginFill(color, 1);
      gfx.drawCircle(0, 0, r);
      gfx.endFill();
      gfx.position.set(x, y);
      this.particlesLayer.addChild(gfx);
      this.particles.push({
        gfx,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        born: performance.now(),
        life: 260 + Math.random() * 220,
        r,
        color,
      });
    }
  }

  private tickParticles(now: number): void {
    if (this.particles.length === 0) return;
    const keep: Particle[] = [];
    for (const p of this.particles) {
      const age = now - p.born;
      if (age >= p.life) {
        p.gfx.destroy();
        continue;
      }
      const t = age / 1000;
      p.gfx.x += p.vx * t * 0.06;
      p.gfx.y += (p.vy + 220 * t) * t * 0.06; // légère gravité
      p.gfx.alpha = 1 - age / p.life;
      keep.push(p);
    }
    this.particles = keep;
  }

  /**
   * Anneau de flash au moment d'un choc ou d'un KO — sur des chocs
   * simultanés en 3v3, difficile de repérer d'un coup d'œil qui vient de
   * se faire toucher ; ce flash blanc net (au lieu de juste la couleur du
   * camp, qui se noie dans le reste) résout ça sans nouvelle animation.
   */
  private renderImpacts(now: number): void {
    const g = this.impactG;
    g.clear();
    const HIT_MS = 220;
    const KO_MS = 420;
    const keep: ImpactMark[] = [];
    for (const m of this.impacts) {
      const dur = m.ko ? KO_MS : HIT_MS;
      const age = now - m.born;
      if (age < 0 || age >= dur) continue;
      keep.push(m);
      const p = age / dur;
      const ease = 1 - (1 - p) * (1 - p);
      const rMax = m.r * (m.ko ? 2.6 : 1.9);
      const rr = m.r * 0.7 + ease * (rMax - m.r * 0.7);
      const alpha = 1 - p;
      // anneau net, blanc pour un KO (se détache de tout), couleur de camp sinon
      g.lineStyle(m.ko ? 4 : 2.5, m.ko ? 0xffffff : m.color, alpha * (m.ko ? 0.95 : 0.75));
      g.drawCircle(m.x, m.y, rr);
      if (m.ko) {
        // second anneau, un cran derrière — lit comme une onde de KO
        g.lineStyle(2, m.color, alpha * 0.5);
        g.drawCircle(m.x, m.y, rr * 0.72);
      }
    }
    this.impacts = keep;
  }

  // ---- visée --------------------------------------------------------------

  private aim(a: NonNullable<MatchView["aim"]>, armed: boolean, hero: HeroKind | undefined, arena: Arena | undefined): void {
    const g = this.fxG;
    g.clear();
    const x0 = sc(fx.toFloat(a.x0));
    const y0 = sc(fx.toFloat(a.y0));
    const power = Math.max(0, Math.min(a.power, 1));

    const idx = trig.angleToIdx(Math.atan2(fx.toFloat(a.y1 - a.y0), fx.toFloat(a.x1 - a.x0)));
    const dirx = fx.toFloat(trig.cosIdx(idx));
    const diry = fx.toFloat(trig.sinIdx(idx));

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
      (exW < 0 || exW > fx.toFloat(arena.w) || eyW < 0 || eyW > fx.toFloat(arena.h));
    const guide = outOfBounds ? P1 : armed ? GOLD : INK;

    if (armed && !outOfBounds) glow(g, (x0 + ex) / 2, (y0 + ey) / 2, Math.hypot(ex - x0, ey - y0) / 2, GOLD, 0.08);
    g.lineStyle(armed || outOfBounds ? 4 : 3, guide, 0.9);
    g.moveTo(x0, y0);
    g.lineTo(ex, ey);

    const ang = Math.atan2(ey - y0, ex - x0);
    g.beginFill(guide, 1);
    g.moveTo(ex, ey);
    g.lineTo(ex - 15 * Math.cos(ang - 0.4), ey - 15 * Math.sin(ang - 0.4));
    g.lineTo(ex - 15 * Math.cos(ang + 0.4), ey - 15 * Math.sin(ang + 0.4));
    g.closePath();
    g.endFill();

    if (hero) {
      const gr = sc(fx.toFloat(HEROES[hero].radius));
      dashedCircle(g, ex, ey, gr, 2, guide, 0.9, 4, 4);
      g.beginFill(guide, 0.1);
      g.drawCircle(ex, ey, gr);
      g.endFill();
    }

    g.lineStyle(5, GOLD, 1);
    g.arc(x0, y0, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * power);
  }

  // ---- retours de capacité -------------------------------------------------

  private effects(v: MatchView, now: number): void {
    const casts = v.casts ?? [];
    const shocks = v.shocks ?? [];
    const castMs = v.castMs ?? 750;
    const shockMs = v.shockMs ?? 520;

    const g = this.effectsG;
    g.clear();
    this.vignetteG.clear();

    for (const s of shocks) {
      const p = (now - s.born) / shockMs;
      if (p < 0 || p >= 1) continue;
      const cx = sx(s.x);
      const cy = sx(s.y);
      const rMax = sc(fx.toFloat(s.rMax));
      const c = col(s.owner);
      const ease = 1 - (1 - p) * (1 - p);
      g.beginFill(c, 0.16 * (1 - p));
      g.drawCircle(cx, cy, rMax * ease);
      g.endFill();
      for (let k = 0; k < 3; k++) {
        const rp = ease + k * 0.14;
        if (rp >= 1) continue;
        g.lineStyle(3 - k, c, (1 - rp) * 0.9);
        g.drawCircle(cx, cy, rMax * rp);
      }
    }

    for (const c of casts) {
      const p = (now - c.born) / castMs;
      if (p < 0 || p >= 1) continue;
      const cx = sx(c.x);
      const cy = sx(c.y);
      const cc = col(c.owner);

      if (p < 0.5) {
        const bp = p / 0.5;
        g.lineStyle(4, cc, (1 - bp) * 0.8);
        g.drawCircle(cx, cy, 18 + bp * 62);
      }
      if (c.hero === "hook" && p < 0.6) {
        const dx = fx.toFloat(trig.cosIdx(c.angleIdx));
        const dy = fx.toFloat(trig.sinIdx(c.angleIdx));
        const len = sc(fx.toFloat(tuning.YANK_RANGE));
        g.lineStyle(2, cc, (1 - p / 0.6) * 0.7);
        g.moveTo(cx, cy);
        g.lineTo(cx + dx * len, cy + dy * len);
      }
    }

    // callouts texte — un PIXI.Text persistant par CastFx actif
    const active = new Set(casts);
    for (const [fxDef, txt] of this.castTexts) {
      if (!active.has(fxDef)) {
        txt.destroy();
        this.castTexts.delete(fxDef);
      }
    }
    for (const c of casts) {
      const p = (now - c.born) / castMs;
      if (p < 0 || p >= 1) continue;
      let txt = this.castTexts.get(c);
      if (!txt) {
        txt = new PIXI.Text(c.name.toUpperCase(), {
          fontFamily: "Bricolage Grotesque, system-ui, sans-serif",
          fontWeight: "700",
          fontSize: 20,
          fill: col(c.owner),
          stroke: VOID,
          strokeThickness: 4,
          align: "center",
        });
        txt.anchor.set(0.5, 0.5);
        this.fxTextLayer.addChild(txt);
        this.castTexts.set(c, txt);
      }
      const rise = v.reducedMotion === true ? 0 : p * 32;
      const alpha = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
      txt.position.set(sx(c.x), sx(c.y) - 44 - rise);
      txt.alpha = alpha;
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
          const c = col(recent.owner);
          this.vignetteG.beginFill(c, a * 0.25);
          this.vignetteG.drawRect(0, 0, VIEW_W, VIEW_H);
          this.vignetteG.endFill();
        }
      }
    }
  }
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(lerp(ar, br, t));
  const gg = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return (r << 16) | (gg << 8) | bl;
}
