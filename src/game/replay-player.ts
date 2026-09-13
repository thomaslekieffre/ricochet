/**
 * Deterministic replay playback. Reconstructs every turn from the order log up
 * front, then plays the frames back with scrub controls.
 *
 * Controls: Espace = lecture/pause · ← / → = tour précédent / suivant.
 */

import { newMatch, resolve } from "../engine/index";
import type { Frame, GameState } from "../engine/index";
import type { HudEls } from "./MatchHud";
import { Renderer } from "./renderer";
import type { RecordedMatch } from "./replay";

interface Turn {
  before: GameState;
  frames: Frame[];
}

export class ReplayPlayer {
  private r: Renderer;
  private turns: Turn[] = [];
  private final: GameState;
  private ti = 0;
  private fi = 0;
  private playing = true;
  private raf = 0;
  private disposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    rec: RecordedMatch,
    private onExit: () => void,
    private els: HudEls,
  ) {
    this.r = new Renderer(canvas);
    let s = newMatch({
      teamA: rec.setup.teamA as never,
      teamB: rec.setup.teamB as never,
      arena: rec.setup.arenaId,
      config: rec.setup.config,
    });
    for (const [a, b] of rec.log) {
      if (s.over) break;
      const res = resolve(s, a, b);
      this.turns.push({ before: s, frames: res.frames });
      s = res.state;
    }
    this.final = s;

    this.els.hud.hidden = false;
    this.els.actionbar.hidden = true;
    this.els.hold.textContent = "Quitter le replay";
    this.els.hold.addEventListener("click", this.exit);
    window.addEventListener("keydown", this.onKey);
    this.raf = requestAnimationFrame(() => this.loop());
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    this.els.hold.removeEventListener("click", this.exit);
    this.els.hold.textContent = "Passer le tour";
    this.els.actionbar.hidden = false;
    this.els.hud.hidden = true;
    this.r.dispose();
  }

  private exit = (): void => this.onExit();

  private onKey = (e: KeyboardEvent): void => {
    if (e.code === "Space") {
      e.preventDefault();
      this.playing = !this.playing;
    } else if (e.code === "ArrowRight") {
      this.ti = Math.min(this.ti + 1, this.turns.length - 1);
      this.fi = 0;
    } else if (e.code === "ArrowLeft") {
      this.ti = Math.max(this.ti - 1, 0);
      this.fi = 0;
    } else if (e.code === "Escape") {
      this.exit();
    }
  };

  private loop(): void {
    if (this.disposed) return;
    const turn = this.turns[this.ti];
    if (turn) {
      if (this.playing) {
        this.fi += 2;
        if (this.fi >= turn.frames.length) {
          if (this.ti < this.turns.length - 1) {
            this.ti += 1;
            this.fi = 0;
          } else {
            this.fi = turn.frames.length - 1;
            this.playing = false;
          }
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
      const st = frame ?? turn.frames[turn.frames.length - 1]!;
      this.els.hold0.textContent = String(st.hold[0]);
      this.els.hold1.textContent = String(st.hold[1]);
    }
    const done = !this.playing && this.ti >= this.turns.length - 1;
    this.els.mom0.textContent = "";
    this.els.mom1.textContent = "";
    this.els.turn.textContent = `REPLAY · tour ${this.ti + 1} / ${this.turns.length}`;
    this.els.prompt.textContent = done
      ? `Fin — ${this.final.winner === 0 ? "joueur 1" : "joueur 2"} gagne`
      : this.playing
        ? "Lecture…  (Espace = pause · ← → tour)"
        : "Pause  (Espace = lecture · ← → tour)";
    this.els.timer.textContent = "";
    this.raf = requestAnimationFrame(() => this.loop());
  }
}
