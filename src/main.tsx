import "./styles.css";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createElement, createRef } from "react";
import type { RefObject } from "react";
import { App } from "./game/App";
import { MatchHud } from "./game/MatchHud";
import type { HudEls, HudRefs } from "./game/MatchHud";
import { isMuted, toggleMute } from "./game/audio";

const host = document.getElementById("stagehost");
if (!host) throw new Error("#stagehost introuvable");

// ---- HUD : root React séparé, monté sur #hud avant App (Match/ReplayPlayer/
// SpectateView ont besoin des éléments réels dès leur construction) --------
const hudEl = document.getElementById("hud");
if (!hudEl) throw new Error("#hud introuvable");

const hudRefs: HudRefs = {
  hold0: createRef(),
  hold1: createRef(),
  whoA: createRef(),
  whoB: createRef(),
  mom0: createRef(),
  mom1: createRef(),
  turn: createRef(),
  prompt: createRef(),
  timer: createRef(),
  timerbar: createRef(),
  hold: createRef(),
  actionbar: createRef(),
  abName: createRef(),
  abArch: createRef(),
  abActive: createRef(),
  abAName: createRef(),
  abCost: createRef(),
  abMom: createRef(),
  abKit: createRef(),
  abBase: createRef(),
  abAEffect: createRef(),
  abHint: createRef(),
};

// flushSync : un simple .render() ici ne garantit pas que les refs soient
// peuplées de façon synchrone (constaté en testant — écran vide au boot,
// need() levait "élément du HUD non monté"). flushSync force le commit
// (et l'attachement des refs, qui s'y fait) avant de continuer.
flushSync(() => {
  createRoot(hudEl).render(createElement(MatchHud, { refs: hudRefs }));
});

function need<T>(ref: RefObject<T | null>): T {
  if (!ref.current) throw new Error("élément du HUD non monté");
  return ref.current;
}

const hud: HudEls = {
  hud: hudEl,
  hold0: need(hudRefs.hold0),
  hold1: need(hudRefs.hold1),
  whoA: need(hudRefs.whoA),
  whoB: need(hudRefs.whoB),
  mom0: need(hudRefs.mom0),
  mom1: need(hudRefs.mom1),
  turn: need(hudRefs.turn),
  prompt: need(hudRefs.prompt),
  timer: need(hudRefs.timer),
  timerbar: need(hudRefs.timerbar),
  hold: need(hudRefs.hold),
  actionbar: need(hudRefs.actionbar),
  abName: need(hudRefs.abName),
  abArch: need(hudRefs.abArch),
  abActive: need(hudRefs.abActive),
  abAName: need(hudRefs.abAName),
  abCost: need(hudRefs.abCost),
  abMom: need(hudRefs.abMom),
  abKit: need(hudRefs.abKit),
  abBase: need(hudRefs.abBase),
  abAEffect: need(hudRefs.abAEffect),
  abHint: need(hudRefs.abHint),
};

// ---- App : state machine d'écrans, root React séparé sur #overlay --------
const overlay = document.getElementById("overlay");
if (!overlay) throw new Error("#overlay introuvable");
createRoot(overlay).render(createElement(App, { host, hud }));

const mute = document.getElementById("btnMute");
mute?.addEventListener("click", () => {
  const m = toggleMute();
  mute.textContent = m ? "🔇" : "🔊";
});
if (mute) mute.textContent = isMuted() ? "🔇" : "🔊";
