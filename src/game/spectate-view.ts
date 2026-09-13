/**
 * Spectate en direct (docs/PHASES.md P6). Même lecteur que `ReplayPlayer`,
 * mais alimenté au fil de l'eau par les messages `turn` du serveur au lieu
 * d'un log d'ordres déjà connu — le match tourne ailleurs, on ne fait
 * qu'animer ce qu'il diffuse. Aucune entrée locale : le spectateur ne peut
 * pas jouer.
 *
 * Contrôles : Échap = quitter.
 */
import type { Frame, GameState } from "../engine/index";
import type { NetClient } from "../net/client";
import type { ServerMsg } from "../net/protocol";
import type { HudEls } from "./MatchHud";
import { Renderer } from "./renderer";

interface Turn {
  before: GameState;
  frames: Frame[];
}

export class SpectateView {
  private r: Renderer;
  private turns: Turn[] = [];
  private current: GameState;
  private ti = 0;
  private fi = 0;
  private ended: { winner: 0 | 1 | null } | null = null;
  private raf = 0;
  private disposed = false;
  private offNet: () => void;

  constructor(
    canvas: HTMLCanvasElement,
    private client: NetClient,
    initialState: GameState,
    private onExit: () => void,
    private els: HudEls,
  ) {
    this.r = new Renderer(canvas);
    this.current = initialState;

    this.els.hud.hidden = false;
    this.els.actionbar.hidden = true;
    this.els.hold.textContent = "Quitter le direct";
    this.els.hold.addEventListener("click", this.exit);
    window.addEventListener("keydown", this.onKey);
    this.offNet = client.on((m) => this.onMsg(m));
    this.raf = requestAnimationFrame(() => this.loop());
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.offNet();
    window.removeEventListener("keydown", this.onKey);
    this.els.hold.removeEventListener("click", this.exit);
    this.els.hold.textContent = "Passer le tour";
    this.els.actionbar.hidden = false;
    this.els.hud.hidden = true;
    this.r.dispose();
  }

  private exit = (): void => this.onExit();

  private onKey = (e: KeyboardEvent): void => {
    if (e.code === "Escape") this.exit();
  };

  private onMsg(m: ServerMsg): void {
    if (m.t === "turn") {
      this.turns.push({ before: this.current, frames: m.frames });
      this.current = m.state;
    } else if (m.t === "spectateEnded") {
      this.ended = { winner: m.winner };
    } else if (m.t === "error") {
      this.ended = { winner: null };
    }
  }

  private loop(): void {
    if (this.disposed) return;
    const turn = this.turns[this.ti];
    let lastHold: [number, number] = [this.current.hold[0], this.current.hold[1]];

    if (turn) {
      this.fi += 2;
      if (this.fi >= turn.frames.length) {
        if (this.ti < this.turns.length - 1) {
          this.ti += 1;
          this.fi = 0;
        } else {
          this.fi = turn.frames.length - 1;
        }
      }
      const frame = turn.frames[Math.min(this.fi, turn.frames.length - 1)] ?? null;
      this.r.draw({
        state: turn.before,
        phase: "resolving",
        activeSide: 0,
        selectedId: null,
        aim: null,
        frame,
        shake: frame?.ko ? 0.6 : 0,
        curtainFor: null,
      });
      lastHold = frame ? frame.hold : lastHold;
    } else {
      this.r.draw({
        state: this.current,
        phase: "resolving",
        activeSide: 0,
        selectedId: null,
        aim: null,
        frame: null,
        shake: 0,
        curtainFor: null,
      });
    }

    this.els.hold0.textContent = String(lastHold[0]);
    this.els.hold1.textContent = String(lastHold[1]);
    this.els.mom0.textContent = "";
    this.els.mom1.textContent = "";
    this.els.turn.textContent = `EN DIRECT · tour ${this.current.turn}`;
    this.els.prompt.textContent = this.ended
      ? this.ended.winner === null
        ? "Le match s'est arrêté."
        : `Fin — camp ${this.ended.winner === 0 ? "vert" : "rose"} gagne`
      : turn
        ? "Retransmission en cours…  (Échap = quitter)"
        : "En attente du prochain tour…  (Échap = quitter)";
    this.els.timer.textContent = "";
    this.raf = requestAnimationFrame(() => this.loop());
  }
}
