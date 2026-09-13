import { useState } from "react";
import { HEROES, type HeroKind } from "../../engine/index";
import { ARCH_FR } from "../labels";

export interface OnlineDraftScreenProps {
  phase: "ban" | "pick";
  pool: HeroKind[];
  onBan: (hero: HeroKind) => void;
  onPick: (team: HeroKind[]) => void;
  onCancel: () => void;
}

function PoolCard({
  hero,
  on,
  locked,
  badge,
  onClick,
}: {
  hero: HeroKind;
  on: boolean;
  locked: boolean;
  badge?: number;
  onClick: () => void;
}) {
  const d = HEROES[hero];
  const cls = ["pcard", on ? "on" : "", locked ? "locked" : ""].filter(Boolean).join(" ");
  return (
    <button className={cls} disabled={locked} onClick={onClick}>
      {badge ? <span className="pc-badge">{badge}</span> : null}
      <span className="pc-name">{d.name}</span>
      <span className={`pc-arch a-${d.archetype}`}>{ARCH_FR[d.archetype]}</span>
      <span className="pc-blurb">{d.blurb}</span>
      <span className="pc-kit">
        <kbd>A</kbd>
        {d.ability.name} · {d.abilityCost}
      </span>
    </button>
  );
}

/**
 * Draft en ligne (docs/PHASES.md P6) : pilotée par le serveur — un `draft`
 * (ban, puis pick) à la fois, un seul appel par message reçu. Une fois le
 * choix envoyé, l'écran se fige sur "en attente de l'adversaire" jusqu'au
 * prochain message serveur (une nouvelle instance de ce composant, montée
 * par le prochain appel de onlineDraftScreen() dans ui.ts).
 */
export function OnlineDraftScreen({ phase, pool, onBan, onPick, onCancel }: OnlineDraftScreenProps) {
  const [picked, setPicked] = useState<HeroKind[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const head = phase === "ban" ? "Bannis un héros" : "Compose ton équipe";
  const sub =
    phase === "ban"
      ? "Il sort de la sélection pour les deux camps."
      : `Choisis 3 héros parmi les ${pool.length} restants.`;

  const pickCard = (h: HeroKind): void => {
    if (submitted) return;
    if (phase === "ban") {
      setSubmitted(true);
      onBan(h);
      return;
    }
    setPicked((cur) => (cur.includes(h) ? cur.filter((x) => x !== h) : cur.length < 3 ? [...cur, h] : cur));
  };

  const submit = (): void => {
    if (picked.length !== 3) return;
    setSubmitted(true);
    onPick(picked);
  };

  return (
    <div className="screen draft">
      <h2>{head}</h2>
      <p className="sub">{sub}</p>
      {phase === "pick" && <p className="sub">{picked.length}/3</p>}
      <div className="pool">
        {pool.map((h) => (
          <PoolCard
            key={h}
            hero={h}
            on={picked.includes(h)}
            locked={submitted}
            badge={phase === "pick" && picked.includes(h) ? picked.indexOf(h) + 1 : undefined}
            onClick={() => pickCard(h)}
          />
        ))}
      </div>
      {phase === "pick" && (
        <button className="cta" disabled={picked.length !== 3 || submitted} onClick={submit}>
          Valider
        </button>
      )}
      {submitted && <p className="sub">En attente de l&apos;adversaire…</p>}
      <button className="linkbtn" onClick={onCancel}>
        Annuler
      </button>
    </div>
  );
}
