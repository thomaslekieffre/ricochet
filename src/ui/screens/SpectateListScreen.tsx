export interface SpectateRow {
  matchId: string;
  label: string;
}

export interface SpectateListScreenProps {
  rows: SpectateRow[];
  onWatch: (matchId: string) => void;
  onRefresh: () => void;
  onCancel: () => void;
}

/** Liste des matchs en direct (docs/PHASES.md P6). Rafraîchissable, lecture seule. */
export function SpectateListScreen({ rows, onWatch, onRefresh, onCancel }: SpectateListScreenProps) {
  return (
    <div className="screen">
      <h2>Matchs en direct</h2>
      <p className="sub">
        {rows.length === 0 ? "Aucun match en cours pour l'instant." : "Choisis un match à suivre."}
      </p>
      <div className="pool">
        {rows.map((r) => (
          <button className="pcard" key={r.matchId} onClick={() => onWatch(r.matchId)}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="menu-foot">
        <button className="linkbtn" onClick={onRefresh}>
          Rafraîchir
        </button>
        <button className="cta ghost" onClick={onCancel}>
          Retour
        </button>
      </div>
    </div>
  );
}
