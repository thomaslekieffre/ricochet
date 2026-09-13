import type { RefObject } from "react";

/**
 * Éléments du HUD dont `Match`/`ReplayPlayer`/`SpectateView` (classes
 * impératives, boucle `requestAnimationFrame` propre) ont besoin pour leurs
 * écritures à 60 fps — jamais du `setState` React ici, ce serait 60
 * re-renders/s pour du texte (décision structurante #2 du plan de migration).
 */
export interface HudRefs {
  hold0: RefObject<HTMLElement | null>;
  hold1: RefObject<HTMLElement | null>;
  whoA: RefObject<HTMLElement | null>;
  whoB: RefObject<HTMLElement | null>;
  mom0: RefObject<HTMLDivElement | null>;
  mom1: RefObject<HTMLDivElement | null>;
  turn: RefObject<HTMLElement | null>;
  prompt: RefObject<HTMLElement | null>;
  timer: RefObject<HTMLElement | null>;
  timerbar: RefObject<HTMLElement | null>;
  hold: RefObject<HTMLButtonElement | null>;
  actionbar: RefObject<HTMLDivElement | null>;
  abName: RefObject<HTMLElement | null>;
  abArch: RefObject<HTMLElement | null>;
  abActive: RefObject<HTMLButtonElement | null>;
  abAName: RefObject<HTMLElement | null>;
  abCost: RefObject<HTMLElement | null>;
  abMom: RefObject<HTMLDivElement | null>;
  abKit: RefObject<HTMLDivElement | null>;
  abBase: RefObject<HTMLElement | null>;
  abAEffect: RefObject<HTMLParagraphElement | null>;
  abHint: RefObject<HTMLParagraphElement | null>;
}

export interface MatchHudProps {
  refs: HudRefs;
}

/**
 * Version « dépouillée » de `HudRefs` : les éléments DOM réels, tels que
 * `Match`/`ReplayPlayer`/`SpectateView` les reçoivent (construits une fois
 * dans `main.tsx` après le montage de `MatchHud`, jamais par
 * `document.getElementById` côté session — cf. étape 4 du plan de
 * migration : « byId() disparaît »).
 */
export interface HudEls {
  hud: HTMLElement;
  hold0: HTMLElement;
  hold1: HTMLElement;
  whoA: HTMLElement;
  whoB: HTMLElement;
  mom0: HTMLDivElement;
  mom1: HTMLDivElement;
  turn: HTMLElement;
  prompt: HTMLElement;
  timer: HTMLElement;
  timerbar: HTMLElement;
  hold: HTMLButtonElement;
  actionbar: HTMLDivElement;
  abName: HTMLElement;
  abArch: HTMLElement;
  abActive: HTMLButtonElement;
  abAName: HTMLElement;
  abCost: HTMLElement;
  abMom: HTMLDivElement;
  abKit: HTMLDivElement;
  abBase: HTMLElement;
  abAEffect: HTMLElement;
  abHint: HTMLElement;
}

/**
 * Arborescence JSX du HUD — même markup, mêmes classes/ids que la version
 * statique d'origine (`styles.css` cible certains ids directement :
 * `#turnlabel`, `#prompt`, `#timerbar`, `#timer`). Monté une seule fois par
 * `main.tsx` sur `#hud`, dans un root React séparé de celui d'`App`
 * (`#overlay`) — la structure ne change jamais, seul son contenu est réécrit
 * impérativement par la session de jeu active.
 */
export function MatchHud({ refs }: MatchHudProps) {
  return (
    <>
      <div className="hud-top">
        <div className="score score-a">
          <span className="who" id="whoA" ref={refs.whoA}>
            Toi
          </span>
          <b id="hold0" ref={refs.hold0}>
            0
          </b>
          <div className="mom" id="mom0" ref={refs.mom0}>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
          </div>
        </div>
        <div className="mid">
          <span id="turnlabel" ref={refs.turn}></span>
          <span id="prompt" ref={refs.prompt}></span>
          <div className="timerwrap">
            <span id="timerbar" ref={refs.timerbar}></span>
          </div>
        </div>
        <div className="score score-b">
          <span className="who" id="whoB" ref={refs.whoB}>
            Bot
          </span>
          <b id="hold1" ref={refs.hold1}>
            0
          </b>
          <div className="mom" id="mom1" ref={refs.mom1}>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
            <i></i>
          </div>
        </div>
      </div>

      <div className="actionbar" id="actionbar" ref={refs.actionbar}>
        <div className="ab-main" id="abMain">
          <div className="ab-head">
            <span className="ab-name" id="abName" ref={refs.abName}>
              Choisis un héros
            </span>
            <span className="ab-arch" id="abArch" ref={refs.abArch}></span>
          </div>
          <button className="ab-active" id="abActive" type="button" hidden ref={refs.abActive}>
            <kbd>A</kbd>
            <span className="ab-aname" id="abAName" ref={refs.abAName}></span>
            <span className="ab-cost" id="abCost" ref={refs.abCost}></span>
            <span className="ab-mom" id="abMom" title="Momentum de ton équipe" ref={refs.abMom}>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </span>
          </button>
          <div className="ab-kit" id="abKit" hidden ref={refs.abKit}>
            <p className="ab-line">
              <span className="ab-tag">de base</span>
              <em id="abBase" ref={refs.abBase}></em>
            </p>
            <p className="ab-eff" id="abAEffect" ref={refs.abAEffect}></p>
          </div>
          <p className="ab-hint" id="abHint" ref={refs.abHint}>
            Glisse depuis un héros pour viser · <b>1 / 2 / 3</b> pour choisir · <b>A</b> arme la capacité
          </p>
        </div>
        <div className="ab-tail">
          <button id="btnHold" type="button" ref={refs.hold}>
            Passer
          </button>
          <span id="timer" ref={refs.timer}></span>
        </div>
      </div>
    </>
  );
}
