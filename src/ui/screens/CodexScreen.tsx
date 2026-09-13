import { HEROES, ROSTER } from "../../engine/index";
import { HERO_PORTRAIT } from "../hero-portraits";
import { ARCH_FR } from "../labels";

export interface CodexScreenProps {
  onBack: () => void;
}

export function CodexScreen({ onBack }: CodexScreenProps) {
  return (
    <div className="screen wide codex">
      <h2>Les héros</h2>
      <p className="sub">
        1 héros bouge par tour, puis se repose un tour avant de pouvoir rejouer. Sa <b>capacité</b> se
        déclenche avec <kbd>A</kbd> et coûte du Momentum : +1 par tour, plafond 5, tu démarres à 2.
      </p>
      <div className="codex-grid">
        {ROSTER.map((h) => {
          const d = HEROES[h];
          return (
            <div className="cx-card" key={h}>
              <div className="cx-top">
                <span className={`roster-medal a-${d.archetype} cx-portrait`}>
                  <img src={HERO_PORTRAIT[h]} alt="" />
                </span>
                <span className="cx-name">{d.name}</span>
                <span className={`pc-arch a-${d.archetype}`}>{ARCH_FR[d.archetype]}</span>
              </div>
              <p className="cx-row">
                <span className="cx-tag">de base</span>
                {d.base}
              </p>
              <p className="cx-row cx-ability">
                <kbd>A</kbd>
                <b>{d.ability.name}</b>
                <span className="cx-acost">{d.abilityCost} Momentum</span>
                <span className="cx-eff">{d.ability.effect}</span>
              </p>
              <p className="cx-row">
                <span className="cx-tag">passif</span>
                {d.passive.name} — {d.passive.effect}
              </p>
            </div>
          );
        })}
      </div>
      <button className="cta" onClick={onBack}>
        Retour
      </button>
    </div>
  );
}
