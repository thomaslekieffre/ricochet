import { useEffect, useRef, useState } from "react";

export interface HistoryRow {
  won: boolean;
  label: string;
  score: string;
  delta: string;
}

export interface ProfileView {
  name: string;
  level: number;
  into: number;
  span: number;
  xp: number;
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  streakLabel: string;
  ratingLine: string;
  /** Jauge de progression dans le palier classé courant ; absente si non classé. */
  tier?: { pct: number; label: string };
  history: HistoryRow[];
}

export interface ProfileScreenProps {
  view: ProfileView;
  onBack: () => void;
  onRename: () => void;
  onReset: () => void;
  onAccount: () => void;
  accountLine: string;
}

/** Barre de progression qui s'anime de 0 au montage — imite animateBars() du show() legacy. */
function Gauge({ pct, className = "xpbar" }: { pct: number; className?: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setWidth(pct));
    return () => cancelAnimationFrame(raf);
  }, [pct]);
  return (
    <div className={className}>
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

export function ProfileScreen({ view: v, onBack, onRename, onReset, onAccount, accountLine }: ProfileScreenProps) {
  const pct = Math.round((v.into / v.span) * 100);
  const [resetArmed, setResetArmed] = useState(false);
  const armTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(armTimer.current), []);

  const handleReset = (): void => {
    if (!resetArmed) {
      setResetArmed(true);
      armTimer.current = window.setTimeout(() => setResetArmed(false), 3000);
      return;
    }
    window.clearTimeout(armTimer.current);
    onReset();
  };

  return (
    <div className="screen wide profile">
      <div className="pbig">
        <span className="pbig-name">{v.name}</span>
        <span className="pbig-lv">Nv {v.level}</span>
      </div>
      <p className="ratingline">{v.ratingLine}</p>
      <p className="sub">
        {v.xp} XP total{v.streakLabel ? ` · ${v.streakLabel}` : ""}
      </p>

      {v.tier && (
        <>
          <Gauge pct={v.tier.pct} className="xpbar tierbar" />
          <p className="sub" style={{ margin: ".35rem 0 1.1rem" }}>
            {v.tier.label}
          </p>
        </>
      )}

      <Gauge pct={pct} />
      <p className="sub" style={{ margin: ".35rem 0 1.1rem" }}>
        {v.into} / {v.span} vers le niveau {v.level + 1}
      </p>

      <div className="statrow">
        <div>
          <b>{v.games}</b>
          <span>parties</span>
        </div>
        <div>
          <b>
            {v.wins}–{v.losses}
          </b>
          <span>V–D</span>
        </div>
        <div>
          <b>{v.winrate}%</b>
          <span>winrate</span>
        </div>
      </div>

      <h3 className="hh">Derniers matchs</h3>
      <div className="hlist">
        {v.history.length === 0 ? (
          <p className="sub">Aucune partie jouée. Lance un match.</p>
        ) : (
          v.history.map((h, i) => (
            <div className={`hrow ${h.won ? "w" : "l"}`} key={i}>
              <span className="hres">{h.won ? "V" : "D"}</span>
              <span className="hlab">{h.label}</span>
              <span className="hsc">{h.score}</span>
              <span className="hdl">{h.delta}</span>
            </div>
          ))
        )}
      </div>

      <p className="sub" style={{ marginTop: "1.2rem" }}>
        {accountLine}
      </p>
      <div className="rowbtns">
        <button className="cta ghost" onClick={onAccount}>
          Compte PocketBase
        </button>
      </div>

      <div className="rowbtns" style={{ marginTop: "1.2rem" }}>
        <button className="cta ghost" onClick={onRename}>
          Changer de pseudo
        </button>
        <button className="cta ghost danger" onClick={handleReset}>
          {resetArmed ? "Confirmer la remise à zéro" : "Réinitialiser"}
        </button>
      </div>
      <button className="cta" onClick={onBack} style={{ marginTop: "0.7rem" }}>
        Retour
      </button>
    </div>
  );
}
