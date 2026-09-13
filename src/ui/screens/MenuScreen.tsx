import { useState } from "react";
import type { StartOpts } from "../../game/ui";

export interface MenuChip {
  name: string;
  level: number;
  line: string;
}

export interface MenuScreenProps {
  chip: MenuChip | null;
  onStart: (o: StartOpts) => void;
  onReplay: () => void;
  onProfile: () => void;
  onCodex: () => void;
  onSpectate: () => void;
  onRank: () => void;
  onLocker: () => void;
}

type Mode = StartOpts["mode"];
type BotLevel = StartOpts["botLevel"];

export function MenuScreen({
  chip,
  onStart,
  onReplay,
  onProfile,
  onCodex,
  onSpectate,
  onRank,
  onLocker,
}: MenuScreenProps) {
  const [mode, setMode] = useState<Mode>("bot");
  const [botLevel, setBotLevel] = useState<BotLevel>(2);
  const [arenaId, setArenaId] = useState("carrefour");

  return (
    <div className="screen menu">
      {chip ? (
        <button className="pchip" title="Ton profil" onClick={onProfile}>
          <span className="pn">{chip.name}</span>
          <span className="pl">Nv {chip.level}</span>
          <span className="pd">{chip.line}</span>
        </button>
      ) : (
        <span className="pchip pchip-ghost">Ricochet</span>
      )}

      <div className="launch">
        <button className="bigplay" onClick={() => onStart({ mode, botLevel, arenaId })}>
          Jouer
        </button>
        <p className="launch-sub">Mode Contrôle — tiens la zone centrale, premier à 15</p>
      </div>

      <div className="setup">
        <div className="opt">
          <span className="lbl">Adversaire</span>
          <div className="seg">
            <button className={mode === "bot" ? "on" : ""} onClick={() => setMode("bot")}>
              Bot
            </button>
            <button className={mode === "hotseat" ? "on" : ""} onClick={() => setMode("hotseat")}>
              Hotseat
            </button>
            <button className={mode === "online" ? "on" : ""} onClick={() => setMode("online")}>
              En ligne
            </button>
          </div>
        </div>
        {mode === "bot" && (
          <div className="opt">
            <span className="lbl">Niveau du bot</span>
            <div className="seg">
              <button className={botLevel === 1 ? "on" : ""} onClick={() => setBotLevel(1)}>
                Souple
              </button>
              <button className={botLevel === 2 ? "on" : ""} onClick={() => setBotLevel(2)}>
                Correct
              </button>
              <button className={botLevel === 3 ? "on" : ""} onClick={() => setBotLevel(3)}>
                Coriace
              </button>
            </div>
          </div>
        )}
        <div className="opt">
          <span className="lbl">Arène</span>
          <div className="seg">
            <button className={arenaId === "carrefour" ? "on" : ""} onClick={() => setArenaId("carrefour")}>
              Carrefour
            </button>
            <button className={arenaId === "fonderie" ? "on" : ""} onClick={() => setArenaId("fonderie")}>
              Fonderie
            </button>
            <button className={arenaId === "flipper" ? "on" : ""} onClick={() => setArenaId("flipper")}>
              Flipper
            </button>
          </div>
        </div>
        {mode === "online" && (
          <p className="note">
            Il faut un serveur de match en route : <code>npm run server</code>. L&apos;arène choisie s&apos;applique
            si tu es placé en siège&nbsp;1.
          </p>
        )}
      </div>

      <div className="menu-foot">
        <button className="linkbtn" onClick={onCodex}>
          Voir les héros
        </button>
        <button className="linkbtn" onClick={onReplay}>
          Revoir un replay
        </button>
        <button className="linkbtn" onClick={onSpectate}>
          Regarder un match en direct
        </button>
        <button className="linkbtn" onClick={onRank}>
          Classement
        </button>
        <button className="linkbtn" onClick={onLocker}>
          Vestiaire
        </button>
      </div>
    </div>
  );
}
