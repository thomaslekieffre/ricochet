import { useState } from "react";
import { HEROES, ROSTER } from "../../engine/index";
import type { HeroKind } from "../../engine/index";
import { ARCH_FR } from "../labels";

export interface BanPickScreenProps {
  hotseat: boolean;
  onDone: (teamA: HeroKind[], teamB: HeroKind[]) => void;
}

type Step = "ban0" | "ban1" | "pick0" | "pick1";
const STEPS: Step[] = ["ban0", "ban1", "pick0", "pick1"];

interface DraftState {
  step: Step;
  bans: [HeroKind | null, HeroKind | null];
  teams: [HeroKind[], HeroKind[]];
}

function pickRandom<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)]!;
}

function botCompo(pool: HeroKind[]): HeroKind[] {
  const p = pool.slice();
  for (let i = p.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  return p.slice(0, 3);
}

type AdvanceResult = DraftState | { done: true; teamA: HeroKind[]; teamB: HeroKind[] };

/** Avance d'un cran ; si le bot doit jouer, résout son tour et boucle (jamais affiché). */
function advance(state: DraftState, hotseat: boolean): AdvanceResult {
  let { bans, teams } = state;
  let cur: Step | "done" =
    state.step === "ban0" ? "ban1" : state.step === "ban1" ? "pick0" : state.step === "pick0" ? "pick1" : "done";

  for (;;) {
    if (cur === "done") return { done: true, teamA: teams[0], teamB: teams[1] };
    if (!hotseat && cur === "ban1") {
      bans = [bans[0], pickRandom(ROSTER.filter((h) => h !== bans[0]))];
      cur = "pick0";
      continue;
    }
    if (!hotseat && cur === "pick1") {
      const alive = ROSTER.filter((h) => h !== bans[0] && h !== bans[1]);
      teams = [teams[0], botCompo(alive)];
      cur = "done";
      continue;
    }
    return { step: cur, bans, teams };
  }
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

function TeamPanel({
  sideCls,
  head,
  ban,
  team,
  reveal,
  active,
}: {
  sideCls: "a" | "b";
  head: string;
  ban: HeroKind | null;
  team: HeroKind[];
  reveal: boolean;
  active: boolean;
}) {
  return (
    <div className={`vteam ${sideCls} ${active ? "active" : ""}`}>
      <span className="vhead">{head}</span>
      <span className={`vban ${ban ? "set" : ""}`}>{ban ? `banni : ${HEROES[ban].name}` : "aucun ban"}</span>
      <ol className="vslots">
        {[0, 1, 2].map((i) => {
          const h = team[i];
          const filled = reveal && h;
          return (
            <li key={i} className={`vslot ${filled ? "set" : ""}`}>
              {filled ? HEROES[h].name : ""}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Draft ban/pick pour les modes locaux — chaque camp bannit 1 héros du pool
 * commun, puis compose 3 héros parmi les restants. Le bot bannit/compose au
 * hasard et ses étapes ne sont jamais affichées (résolues instantanément).
 */
export function BanPickScreen({ hotseat, onDone }: BanPickScreenProps) {
  const [state, setState] = useState<DraftState>({ step: "ban0", bans: [null, null], teams: [[], []] });
  const { step, bans, teams } = state;

  const side: 0 | 1 = step === "ban0" || step === "pick0" ? 0 : 1;
  const isBan = step === "ban0" || step === "ban1";
  const cur = teams[side];
  const otherBan = bans[side === 0 ? 1 : 0];
  const isLocked = (h: HeroKind): boolean => (isBan ? h === otherBan : h === bans[0] || h === bans[1]);
  const sideName = (s: 0 | 1): string => (hotseat ? `Joueur ${s + 1}` : s === 0 ? "Toi" : "Bot");

  const title = isBan ? `${sideName(side)} — bannis un héros` : `${sideName(side)} — ta compo`;
  const sub = isBan
    ? "Il sort de la sélection pour les deux camps."
    : `Choisis 3 héros parmi les 4 restants. ${cur.length}/3`;

  const revealA = teams[0].length === 3 || side === 0;
  const revealB = teams[1].length === 3 || side === 1;
  const ready = isBan ? bans[side] !== null : cur.length === 3;
  const nextLabel = isBan
    ? hotseat && step === "ban0"
      ? "Ban du Joueur 2"
      : "Passer aux compos"
    : hotseat && step === "pick0"
      ? "Au Joueur 2"
      : "Lancer le match";

  const pickCard = (h: HeroKind): void => {
    if (isLocked(h)) return;
    if (isBan) {
      setState({ ...state, bans: side === 0 ? [h, bans[1]] : [bans[0], h] });
      return;
    }
    const next = cur.includes(h) ? cur.filter((x) => x !== h) : cur.length < 3 ? [...cur, h] : cur;
    setState({ ...state, teams: side === 0 ? [next, teams[1]] : [teams[0], next] });
  };

  const goNext = (): void => {
    if (!ready) return;
    const result = advance(state, hotseat);
    if ("done" in result) onDone(result.teamA, result.teamB);
    else setState(result);
  };

  return (
    <div className="screen draft">
      <div className="draft-steps">
        {STEPS.map((s) => {
          const done = STEPS.indexOf(s) < STEPS.indexOf(step);
          const now = s === step;
          const lbl = s.startsWith("ban") ? "Ban" : "Compo";
          return (
            <i key={s} className={`ds ${done ? "done" : ""} ${now ? "on" : ""}`}>
              {lbl}
            </i>
          );
        })}
      </div>
      <h2>{title}</h2>
      <p className="sub">{sub}</p>

      <div className="versus">
        <TeamPanel sideCls="a" head={sideName(0)} ban={bans[0]} team={teams[0]} reveal={revealA} active={side === 0} />
        <span className="vs">vs</span>
        <TeamPanel sideCls="b" head={sideName(1)} ban={bans[1]} team={teams[1]} reveal={revealB} active={side === 1} />
      </div>

      <div className="pool">
        {ROSTER.map((h) => {
          const locked = isLocked(h);
          const on = isBan ? h === bans[side] : cur.includes(h);
          const badge = !isBan && cur.includes(h) ? cur.indexOf(h) + 1 : undefined;
          return <PoolCard key={h} hero={h} on={on} locked={locked} badge={badge} onClick={() => pickCard(h)} />;
        })}
      </div>
      <button className="cta" disabled={!ready} onClick={goNext}>
        {nextLabel}
      </button>
    </div>
  );
}
