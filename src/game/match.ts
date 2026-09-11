import {
  fx,
  hashState,
  HEROES,
  newMatch,
  resolve,
  trig,
  tuning,
} from "../engine/index";
import type { Frame, GameState, HeroKind, Order, TurnEvent } from "../engine/index";
import type { NetClient } from "../net/client";
import type { ServerMsg } from "../net/protocol";
import { sfx } from "./audio";
import { BotClient } from "./bot-client";
import { Renderer } from "./renderer";
import type { CastFx, ShockFx } from "./renderer";
import { curtain } from "./ui";

const PLAN_SECONDS = 12;
const MAX_DRAG_WORLD = 460;
const PLAYBACK_SPEED = 2;

const ARCH_LABEL: Record<string, string> = {
  brawler: "Brawler",
  dasher: "Dasher",
  sniper: "Sniper",
  mage: "Mage",
};

/** durée de vie des effets de capacité, en ms (temps réel, pur visuel) */
const CAST_MS = 1100;
const SHOCK_MS = 680;

type Side = "human" | "bot" | "remote";
type Phase = "select" | "aim" | "resolving" | "over";

export interface NetBinding {
  client: NetClient;
  matchId: string;
  seat: 0 | 1;
}

export interface MatchOpts {
  teamA: HeroKind[];
  teamB: HeroKind[];
  arenaId: string;
  sides: [Side, Side];
  botLevel: 1 | 2 | 3;
  onOver: (winner: 0 | 1) => void;
  /** online play: authoritative server binding + the initial state it sent */
  net?: NetBinding;
  initialState?: GameState;
  onDisconnect?: () => void;
}

const HOLD_ORDER = (): Order => ({
  bodyId: -1,
  angleIdx: 0,
  power: 0,
  ability: false,
  hold: true,
});

export class Match {
  private r: Renderer;
  private state: GameState;
  private pending: GameState | null = null;

  private phase: Phase = "select";
  private activeSide: 0 | 1 = 0;
  private orders: [Order | null, Order | null] = [null, null];

  private selectedId: number | null = null;
  private dragging = false;
  /** Bouton souris du glissé en cours : 2 (clic droit) = viser avec la capacité. */
  private aimButton = 0;
  private abilityArmed = false;
  private aim: { x0: number; y0: number; x1: number; y1: number; power: number } | null = null;

  private frames: Frame[] = [];
  private frameIdx = 0;
  private events: TurnEvent[] = [];
  private koPlayed = false;
  private shake = 0;

  // ability feedback on the canvas
  private casts: CastFx[] = [];
  private shocks: ShockFx[] = [];
  private readonly reducedMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** [orderA, orderB] per resolved turn — the replay log (docs/PHASES.md P6). */
  readonly log: [Order, Order][] = [];

  private timerStart = performance.now();
  private raf = 0;
  private waitingCurtain = false;
  private botThinking = false;
  private awaitingServer = false;
  private lastPlayedTurn = -1;
  private netUnsub: (() => void) | null = null;
  private disposed = false;
  private botClient: BotClient | null = null;

  private get mySeat(): 0 | 1 {
    return this.opts.net ? this.opts.net.seat : this.activeSide;
  }

  /** Team compositions read off the live state — works for online too. */
  get teamComps(): { a: HeroKind[]; b: HeroKind[] } {
    return {
      a: this.state.bodies.filter((x) => x.owner === 0).map((x) => x.hero),
      b: this.state.bodies.filter((x) => x.owner === 1).map((x) => x.hero),
    };
  }

  get arenaId(): string {
    return this.state.arena.id;
  }

  /** Tours joués à l'instant présent (pour l'historique de profil). */
  get turnsPlayed(): number {
    return this.state.turn;
  }

  /** Score de zone [camp 0, camp 1]. */
  get holdScore(): [number, number] {
    return [this.state.hold[0] ?? 0, this.state.hold[1] ?? 0];
  }

  // HUD elements
  private els = {
    hud: byId("hud"),
    whoA: byId("whoA"),
    whoB: byId("whoB"),
    hold0: byId("hold0"),
    hold1: byId("hold1"),
    mom0: byId("mom0"),
    mom1: byId("mom1"),
    turn: byId("turnlabel"),
    prompt: byId("prompt"),
    timer: byId("timer"),
    timerbar: byId("timerbar"),
    hold: byId("btnHold"),
    abName: byId("abName"),
    abArch: byId("abArch"),
    abMom: byId("abMom"),
    abKit: byId("abKit"),
    abBase: byId("abBase"),
    abActive: byId("abActive") as HTMLButtonElement,
    abAName: byId("abAName"),
    abAEffect: byId("abAEffect"),
    abCost: byId("abCost"),
    abHint: byId("abHint"),
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: MatchOpts,
  ) {
    this.r = new Renderer(canvas);
    this.state =
      opts.initialState ??
      newMatch({
        teamA: opts.teamA as [HeroKind, HeroKind, HeroKind],
        teamB: opts.teamB as [HeroKind, HeroKind, HeroKind],
        arena: opts.arenaId,
      });
    if (opts.net) {
      this.netUnsub = opts.net.client.on((m) => this.onNet(m));
    }
    this.bind();
    this.els.hud.hidden = false;
    this.startTurn();
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.botClient?.dispose();
    this.netUnsub?.();
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("contextmenu", this.onContext);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("keydown", this.onKey);
    this.els.abActive.removeEventListener("click", this.onAbilityClick);
    this.els.hold.removeEventListener("click", this.onHoldClick);
    this.els.hud.hidden = true;
  }

  private bind(): void {
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("contextmenu", this.onContext);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("keydown", this.onKey);
    this.els.abActive.addEventListener("click", this.onAbilityClick);
    this.els.hold.addEventListener("click", this.onHoldClick);
  }

  // ---- turn flow ----------------------------------------------------------

  private startTurn(): void {
    this.orders = [null, null];
    this.activeSide = 0;
    this.selectedId = null;
    this.aim = null;
    this.dragging = false;
    this.abilityArmed = false;
    this.advance();
  }

  private advance(): void {
    if (this.disposed) return;

    if (this.opts.net) {
      // online: we only ever plan our own seat; the server resolves
      if (this.state.over) return;
      this.activeSide = this.opts.net.seat;
      this.awaitingServer = false;
      this.selectedId = null;
      this.aim = null;
      this.dragging = false;
      this.abilityArmed = false;
      this.phase = "select";
      this.timerStart = performance.now();
      return;
    }

    if (this.orders[0] && this.orders[1]) {
      this.resolveTurn();
      return;
    }
    const side = (this.orders[0] ? 1 : 0) as 0 | 1;
    this.activeSide = side;
    this.selectedId = null;
    this.aim = null;
    this.dragging = false;
    this.abilityArmed = false;

    if (this.opts.sides[side] === "bot") {
      // le calcul (~250 ms au niveau 2) tourne dans un Web Worker : ne bloque
      // plus le thread principal, donc plus de "thinking" frame à sacrifier.
      this.botThinking = true;
      this.phase = "select";
      this.botClient ??= new BotClient();
      this.botClient.pick(this.state, side, this.opts.botLevel).then((order) => {
        if (this.disposed) return;
        this.orders[side] = order;
        this.botThinking = false;
        this.advance();
      });
      return;
    }

    const bothHuman = this.opts.sides[0] === "human" && this.opts.sides[1] === "human";
    if (bothHuman && side === 1) {
      this.waitingCurtain = true;
      curtain("Joueur 2", () => {
        this.waitingCurtain = false;
        this.phase = "select";
        this.timerStart = performance.now();
      });
      return;
    }

    this.phase = "select";
    this.timerStart = performance.now();
  }

  /** Local player has committed a plan. Offline: store + advance. Online: send. */
  private submitLocalOrder(order: Order): void {
    this.dragging = false;
    this.aim = null;
    this.selectedId = null;
    this.abilityArmed = false;
    sfx.lock();
    if (this.opts.net) {
      this.awaitingServer = true;
      this.opts.net.client.send({
        t: "order",
        matchId: this.opts.net.matchId,
        turn: this.state.turn,
        order,
      });
      return;
    }
    this.orders[this.activeSide] = order;
    this.advance();
  }

  private resolveTurn(): void {
    const a = this.orders[0] ?? HOLD_ORDER();
    const b = this.orders[1] ?? HOLD_ORDER();
    this.log.push([a, b]);
    // Éclat (Prism) : les pulses qui vont détoner en tête de ce tour
    const detonating = this.state.pulses.filter((p) => p.turnsLeft === 1);
    const res = resolve(this.state, a, b);
    this.spawnAbilityFx(res.events, [a, b], detonating);
    this.pending = res.state;
    this.frames = res.frames;
    this.events = res.events;
    this.frameIdx = 0;
    this.koPlayed = false;
    this.phase = "resolving";
  }

  /** Turn the `{kind:"ability"}` events + due pulses into on-canvas effects. */
  private spawnAbilityFx(
    events: TurnEvent[],
    orders: [Order, Order],
    detonating: { x: number; y: number; owner: 0 | 1; radius: number }[],
  ): void {
    const now = performance.now();
    for (const p of detonating) {
      this.shocks.push({ x: p.x, y: p.y, owner: p.owner, rMax: p.radius, born: now });
      sfx.boom();
    }
    for (const e of events) {
      if (e.kind !== "ability") continue;
      const body = this.state.bodies.find((x) => x.id === e.bodyId);
      if (!body) continue;
      const def = HEROES[e.hero];
      const ord = orders[body.owner];
      this.casts.push({
        x: body.x,
        y: body.y,
        owner: body.owner,
        name: def.ability.name,
        hero: e.hero,
        angleIdx: ord.angleIdx,
        born: now,
      });
      if (e.hero === "boulder" || e.hero === "vex") {
        this.shocks.push({
          x: body.x,
          y: body.y,
          owner: body.owner,
          rMax: e.hero === "boulder" ? tuning.QUAKE_RADIUS : tuning.SINKHOLE_RADIUS,
          born: now,
        });
        sfx.boom();
      } else {
        sfx.ability();
      }
    }
  }

  /** Messages from the authoritative server (online only). */
  private onNet(m: ServerMsg): void {
    if (this.disposed) return;
    switch (m.t) {
      case "turn": {
        this.awaitingServer = false;
        this.lastPlayedTurn = m.turn;
        this.log.push(m.ordersPlayed);
        const detonating = this.state.pulses.filter((p) => p.turnsLeft === 1);
        this.spawnAbilityFx(m.events, m.ordersPlayed, detonating);
        this.frames = m.frames;
        this.events = m.events;
        this.pending = m.state;
        this.frameIdx = 0;
        this.koPlayed = false;
        this.phase = "resolving";
        if (hashState(m.state) !== m.hash) {
          console.warn("[ricochet] désync : hash local != serveur, on suit le serveur");
        }
        break;
      }
      case "state":
        // "you may plan turn N" — refresh the clock; snap if we fell behind
        if (!this.state.over && m.state.turn > this.state.turn) {
          this.state = m.state;
          this.startTurn();
        } else if (this.phase === "select" || this.phase === "aim") {
          this.timerStart = performance.now();
        }
        break;
      case "over":
        if (this.phase !== "over") {
          this.phase = "over";
          sfx.win();
          this.opts.onOver(m.winner);
        }
        break;
      case "opponentLeft":
        if (this.phase !== "over") {
          this.phase = "over";
          this.opts.onOver(this.mySeat);
        }
        break;
      case "error":
        this.opts.onDisconnect?.();
        break;
    }
  }

  private finishTurn(): void {
    if (this.pending) this.state = this.pending;
    this.pending = null;
    for (const e of this.events) if (e.kind === "capture") sfx.capture();
    if (this.state.over && this.state.winner !== null) {
      this.phase = "over";
      sfx.win();
      this.opts.onOver(this.state.winner);
      return;
    }
    if (this.opts.net) {
      this.opts.net.client.send({
        t: "ready",
        matchId: this.opts.net.matchId,
        turn: this.lastPlayedTurn,
      });
    }
    this.startTurn();
  }

  // ---- input ------------------------------------------------------------

  private myBodies(): { id: number; x: number; y: number; r: number }[] {
    return this.state.bodies
      .filter((b) => b.owner === this.activeSide && b.alive)
      .map((b) => ({ id: b.id, x: b.x, y: b.y, r: fx.toFloat(b.radius) }));
  }

  private selectHero(id: number): void {
    const b = this.state.bodies.find((x) => x.id === id);
    if (!b || !b.alive || b.owner !== this.activeSide) return;
    this.selectedId = id;
    this.phase = "aim";
    // NB : on ne désarme PAS ici — armer la capacité AVANT de prendre un héros
    // est un flux valide ("A puis attrape le perso et lance-le").
    sfx.select();
  }

  /** L'intention « capacité » vaut pour tout le tour, pas pour un héros donné :
   *  on peut armer avant même d'avoir attrapé un perso. Le coût se vérifie au
   *  moment du tir, sur le héros effectivement lancé. */
  private canArm(): boolean {
    if (this.phase !== "select" && this.phase !== "aim") return false;
    if (this.botThinking || this.waitingCurtain || this.awaitingServer) return false;
    return this.opts.net ? true : this.opts.sides[this.activeSide] === "human";
  }

  private toggleAbility(): void {
    if (!this.canArm()) {
      this.abilityArmed = false;
      return;
    }
    this.abilityArmed = !this.abilityArmed;
    sfx.select();
  }

  private onAbilityClick = (): void => {
    this.toggleAbility();
  };

  private onContext = (e: Event): void => {
    // le clic droit sert à viser avec la capacité — pas de menu contextuel
    e.preventDefault();
  };

  private onDown = (e: PointerEvent): void => {
    if (this.waitingCurtain || this.botThinking || this.awaitingServer) return;
    if (this.phase === "resolving" || this.phase === "over") return;
    // clic droit (button 2) = « ce lancer emporte la capacité »
    this.aimButton = e.button;
    const w = this.r.toWorld(e.clientX, e.clientY);
    if (this.phase === "select") {
      const hit = this.nearestBody(w.x, w.y);
      if (hit !== null) {
        this.selectHero(hit);
        // enchaîne directement sur la visée : un seul geste presser-glisser-relâcher
        const b = this.state.bodies.find((x) => x.id === hit);
        if (b) {
          this.dragging = true;
          this.aim = { x0: b.x, y0: b.y, x1: w.x, y1: w.y, power: 0 };
          this.updateAim(w.x, w.y);
        }
      }
      return;
    }
    if (this.phase === "aim" && this.selectedId !== null) {
      const b = this.state.bodies.find((x) => x.id === this.selectedId);
      if (!b) return;
      this.dragging = true;
      this.aim = { x0: b.x, y0: b.y, x1: w.x, y1: w.y, power: 0 };
      this.updateAim(w.x, w.y);
    }
  };

  private nearestBody(wx: number, wy: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (const b of this.myBodies()) {
      const d = Math.hypot(fx.toFloat(wx - b.x), fx.toFloat(wy - b.y));
      if (d < b.r + 40 && d < bestD) {
        bestD = d;
        best = b.id;
      }
    }
    return best;
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.dragging || !this.aim) return;
    const w = this.r.toWorld(e.clientX, e.clientY);
    this.updateAim(w.x, w.y);
  };

  private updateAim(wx: number, wy: number): void {
    if (!this.aim) return;
    this.aim.x1 = wx;
    this.aim.y1 = wy;
    const dist = Math.hypot(fx.toFloat(wx - this.aim.x0), fx.toFloat(wy - this.aim.y0));
    this.aim.power = Math.min(dist / MAX_DRAG_WORLD, 1);
  }

  private onUp = (): void => {
    if (!this.dragging || !this.aim || this.selectedId === null) return;
    const dx = fx.toFloat(this.aim.x1 - this.aim.x0);
    const dy = fx.toFloat(this.aim.y1 - this.aim.y0);
    const dist = Math.hypot(dx, dy);
    if (dist < 12) {
      // trop court pour être un tir : on garde le héros sélectionné, la visée suit
      this.dragging = false;
      this.aim = null;
      this.phase = "aim";
      return;
    }
    const b = this.state.bodies.find((x) => x.id === this.selectedId)!;
    const def = HEROES[b.hero];
    const affordable = this.state.teams[this.mySeat].momentum >= def.abilityCost;
    // capacité si : armée au préalable (A / bouton) OU visée au clic droit
    const wantAbility = this.abilityArmed || this.aimButton === 2;
    this.submitLocalOrder({
      bodyId: this.selectedId,
      angleIdx: trig.angleToIdx(Math.atan2(dy, dx)),
      power: fx.fromFloat(Math.min(dist / MAX_DRAG_WORLD, 1)),
      ability: wantAbility && affordable,
    });
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.code === "Space" && this.phase === "resolving") {
      e.preventDefault();
      this.frameIdx = this.frames.length;
      return;
    }
    if (this.botThinking || this.waitingCurtain || this.awaitingServer) return;
    if (this.phase !== "select" && this.phase !== "aim") return;
    if (["1", "2", "3"].includes(e.key)) {
      const list = this.state.bodies.filter(
        (b) => b.owner === this.activeSide && b.alive,
      );
      const b = list[Number(e.key) - 1];
      if (b) this.selectHero(b.id);
    } else if (e.code === "KeyA") {
      this.toggleAbility();
    }
  };

  private onHoldClick = (): void => {
    if (this.botThinking || this.waitingCurtain || this.awaitingServer) return;
    if (this.phase !== "select" && this.phase !== "aim") return;
    this.submitLocalOrder(HOLD_ORDER());
  };

  // ---- loop -----------------------------------------------------------

  private loop(t: number): void {
    if (this.disposed) return;

    if (
      (this.phase === "select" || this.phase === "aim") &&
      !this.waitingCurtain &&
      !this.botThinking &&
      !this.awaitingServer
    ) {
      const left = PLAN_SECONDS - (performance.now() - this.timerStart) / 1000;
      if (left <= 0) {
        if (this.dragging && this.aim && this.selectedId !== null) {
          this.onUp();
        } else {
          this.submitLocalOrder(HOLD_ORDER());
        }
      }
    }

    if (this.phase === "resolving") {
      const f = this.frames[Math.min(this.frameIdx, this.frames.length - 1)];
      if (f?.hit) this.shake = Math.max(this.shake, f.ko ? 1 : 0.5);
      if (f?.ko && !this.koPlayed) {
        sfx.ko();
        this.koPlayed = true;
      }
      this.frameIdx += PLAYBACK_SPEED;
      if (this.frameIdx >= this.frames.length) this.finishTurn();
    }

    const now = performance.now();
    this.casts = this.casts.filter((c) => now - c.born < CAST_MS);
    this.shocks = this.shocks.filter((s) => now - s.born < SHOCK_MS);

    this.shake *= 0.86;
    this.render(t);
    this.raf = requestAnimationFrame((tt) => this.loop(tt));
  }

  private render(_t: number): void {
    const frame =
      this.phase === "resolving"
        ? (this.frames[Math.min(this.frameIdx, this.frames.length - 1)] ?? null)
        : null;
    this.r.draw({
      state: this.state,
      phase: this.phase,
      activeSide: this.activeSide,
      selectedId: this.selectedId,
      aim: this.aim,
      frame,
      shake: this.shake,
      curtainFor: this.waitingCurtain ? (this.activeSide as 0 | 1) : null,
      // ambre si la capacité est armée, ou si on vise au clic droit
      abilityArmed: this.abilityArmed || (this.dragging && this.aimButton === 2),
      casts: this.casts,
      shocks: this.shocks,
      now: performance.now(),
      reducedMotion: this.reducedMotion,
      castMs: CAST_MS,
      shockMs: SHOCK_MS,
    });
    this.updateHud(frame);
  }

  // ---- HUD --------------------------------------------------------------

  private setMeter(el: HTMLElement, filled: number, spend: number): void {
    const cells = el.children;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i] as HTMLElement;
      const on = i < filled;
      // les cases dépensées : les plus hautes de la portion remplie
      const isSpend = spend > 0 && on && i >= filled - spend;
      c.classList.toggle("on", on && !isSpend);
      c.classList.toggle("spend", isSpend);
    }
  }

  private updateHud(frame: Frame | null): void {
    const hold = frame ? frame.hold : this.state.hold;
    this.els.hold0.textContent = String(hold[0]);
    this.els.hold1.textContent = String(hold[1]);
    this.els.turn.textContent = `Tour ${this.state.turn + 1} / ${this.state.config.targetHold}`;

    // libellés fixes des deux camps (indépendants du camp actif)
    const sideLabel = (s: 0 | 1): string => {
      if (this.opts.net) return s === this.mySeat ? "Toi" : "Adversaire";
      if (this.opts.sides[0] === "human" && this.opts.sides[1] === "human")
        return `Joueur ${s + 1}`;
      return s === 0 ? "Toi" : "Bot";
    };
    this.els.whoA.textContent = sideLabel(0);
    this.els.whoB.textContent = sideLabel(1);

    const humanSide = this.opts.net
      ? true
      : this.opts.sides[this.activeSide] === "human";
    const vsBotOrRemote =
      this.opts.sides[0] !== "human" || this.opts.sides[1] !== "human";
    const label = vsBotOrRemote
      ? this.activeSide === this.mySeat
        ? "Toi"
        : this.opts.net
          ? "Adversaire"
          : "Bot"
      : `Joueur ${this.activeSide + 1}`;

    const sel =
      this.selectedId !== null
        ? this.state.bodies.find((b) => b.id === this.selectedId)
        : null;
    const armedCost =
      sel && this.abilityArmed ? HEROES[sel.hero].abilityCost : 0;

    // side meters (no "spend" cue here — that lives on the action bar)
    this.setMeter(this.els.mom0, this.state.teams[0].momentum, 0);
    this.setMeter(this.els.mom1, this.state.teams[1].momentum, 0);
    // planner's meter: show the spend the armed ability will make
    this.setMeter(
      this.els.abMom,
      this.state.teams[this.mySeat].momentum,
      this.activeSide === this.mySeat ? armedCost : 0,
    );

    const rightAim = this.dragging && this.aimButton === 2;
    let prompt = "";
    if (this.awaitingServer) prompt = "En attente de l'adversaire…";
    else if (this.phase === "resolving") prompt = "Résolution…";
    else if (this.waitingCurtain) prompt = "…";
    else if (!humanSide) prompt = "Le bot réfléchit…";
    else if ((this.abilityArmed || rightAim) && sel)
      prompt = `${HEROES[sel.hero].ability.name} — vise et lâche pour lancer`;
    else if (this.abilityArmed)
      prompt = `${label} — capacité armée, attrape un héros et lance-le`;
    else if (this.phase === "select")
      prompt = `${label} — attrape un héros (clic droit = avec la capacité)`;
    else prompt = `${label} — vise puis lâche · clic droit pour la capacité`;
    this.els.prompt.textContent = prompt;

    const planning =
      (this.phase === "select" || this.phase === "aim") &&
      !this.waitingCurtain &&
      !this.awaitingServer;
    const leftSec = PLAN_SECONDS - (performance.now() - this.timerStart) / 1000;
    const showTimer = humanSide && planning;
    this.els.timer.textContent = showTimer ? `${Math.max(0, Math.ceil(leftSec))}s` : "";
    this.els.timer.classList.toggle("urgent", showTimer && leftSec <= 3);
    const frac = Math.max(0, Math.min(1, leftSec / PLAN_SECONDS));
    this.els.timerbar.style.width = showTimer ? `${frac * 100}%` : "0%";
    this.els.timerbar.classList.toggle("urgent", showTimer && leftSec <= 3);

    // surligne le camp qui planifie
    this.els.whoA.closest(".score")?.classList.toggle(
      "turn",
      planning && this.activeSide === 0,
    );
    this.els.whoB.closest(".score")?.classList.toggle(
      "turn",
      planning && this.activeSide === 1,
    );

    // ---- barre d'action --------------------------------------------
    // L'intention « capacité » (this.abilityArmed) vaut pour tout le tour : la
    // barre affiche donc le toggle dès la phase de planif, même sans héros pris.
    if (humanSide && planning) {
      this.els.abActive.hidden = false;
      if (sel) {
        const def = HEROES[sel.hero];
        const need = def.abilityCost - this.state.teams[this.mySeat].momentum;
        const affordable = need <= 0;
        const armed = this.abilityArmed && affordable;
        this.els.abName.textContent = def.name;
        this.els.abArch.textContent = ARCH_LABEL[def.archetype] ?? def.archetype;
        this.els.abBase.textContent = def.base;
        this.els.abAEffect.textContent = def.ability.effect;
        this.els.abAName.textContent = armed
          ? `${def.ability.name} · armé`
          : def.ability.name;
        this.els.abCost.textContent = `${def.abilityCost} Momentum`;
        this.els.abActive.classList.toggle("armed", armed);
        this.els.abActive.classList.toggle("cant", this.abilityArmed && !affordable);
        this.els.abKit.hidden = false;
        this.els.abHint.textContent =
          this.abilityArmed && !affordable
            ? `${def.name} n'a pas les ${def.abilityCost} Momentum — il partira sans capacité.`
            : armed
              ? `Capacité armée : ton lancer déclenchera ${def.ability.name}.`
              : `Glisse en clic droit pour lancer avec ${def.ability.name}, en clic gauche sans. (A garde la capacité armée.)`;
        this.els.abHint.hidden = false;
      } else {
        // aucun héros pris en main — on peut déjà armer
        this.els.abName.textContent = "Choisis un héros";
        this.els.abArch.textContent = "";
        this.els.abKit.hidden = true;
        this.els.abAName.textContent = this.abilityArmed
          ? "Capacité armée"
          : "Armer une capacité";
        this.els.abCost.textContent = "";
        this.els.abActive.classList.toggle("armed", this.abilityArmed);
        this.els.abActive.classList.remove("cant");
        this.els.abHint.textContent = this.abilityArmed
          ? "Capacité armée pour ce tour. Attrape un héros et lance-le."
          : "Attrape un héros et glisse : clic gauche = lancer, clic droit = lancer avec la capacité.";
        this.els.abHint.hidden = false;
      }
    } else {
      this.els.abName.textContent =
        this.phase === "resolving"
          ? "Résolution…"
          : this.awaitingServer
            ? "En attente de l'adversaire…"
            : humanSide
              ? "Choisis un héros"
              : `Au tour de ${label}`;
      this.els.abArch.textContent = "";
      this.els.abActive.hidden = true;
      this.els.abKit.hidden = true;
      this.els.abHint.hidden = true;
    }
  }
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} introuvable`);
  return el;
}
