import { useEffect, useRef } from "react";

export interface ResultScreenProps {
  title: string;
  sub: string;
  onRematch: () => void;
  onMenu: () => void;
  onDownloadReplay?: () => void;
  /** HTML brut construit par app.ts (scoreline + jauge XP/note) — jamais du texte saisi par un joueur. */
  progressHtml?: string;
  tone?: "win" | "loss" | "neutral";
}

export function ResultScreen({
  title,
  sub,
  onRematch,
  onMenu,
  onDownloadReplay,
  progressHtml,
  tone = "neutral",
}: ResultScreenProps) {
  const progressRef = useRef<HTMLDivElement>(null);

  // reproduit animateBars() du show() legacy pour les .xpbar injectées via progressHtml
  useEffect(() => {
    const bars = progressRef.current?.querySelectorAll<HTMLElement>(".xpbar span[data-fill]");
    if (!bars || bars.length === 0) return;
    const raf = requestAnimationFrame(() => {
      bars.forEach((b) => {
        b.style.width = `${b.dataset.fill}%`;
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [progressHtml]);

  return (
    <div className="screen result" data-tone={tone}>
      <p className="outcome">{title}</p>
      <p className="sub">{sub}</p>
      {progressHtml && <div ref={progressRef} dangerouslySetInnerHTML={{ __html: progressHtml }} />}
      <div className="rowbtns">
        <button className="cta" onClick={onRematch}>
          Rejouer
        </button>
        <button className="cta ghost" onClick={onMenu}>
          Menu
        </button>
      </div>
      {onDownloadReplay && (
        <button className="linkbtn" style={{ marginTop: "0.9rem" }} onClick={onDownloadReplay}>
          Télécharger le replay
        </button>
      )}
    </div>
  );
}
