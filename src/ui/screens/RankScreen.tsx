import type { RankRow } from "../../net/leaderboard";

export interface RankScreenProps {
  loading: boolean;
  error: string | null;
  seasonName: string | null;
  me: RankRow | null;
  rows: RankRow[];
  onRefresh: () => void;
  onBack: () => void;
}

/** Classement classé réel (docs/PHASES.md P5) — note serveur + top de la saison active. */
export function RankScreen({ loading, error, seasonName, me, rows, onRefresh, onBack }: RankScreenProps) {
  const myRank = me ? rows.findIndex((r) => r.userId === me.userId) : -1;

  return (
    <div className="screen wide">
      <h2>Classement</h2>
      {loading ? (
        <p className="sub">Chargement…</p>
      ) : error ? (
        <p className="sub err">{error}</p>
      ) : !seasonName ? (
        <p className="sub">Aucune saison classée active pour le moment.</p>
      ) : (
        <>
          <p className="sub">{seasonName}</p>

          {me ? (
            <div className="statrow">
              <div>
                <b>{me.placed ? me.tierLabel : "Placement"}</b>
                <span>palier</span>
              </div>
              <div>
                <b>
                  {me.rating} <span style={{ opacity: 0.6 }}>±{me.rd}</span>
                </b>
                <span>note</span>
              </div>
              <div>
                <b>{myRank >= 0 ? `#${myRank + 1}` : "—"}</b>
                <span>rang</span>
              </div>
            </div>
          ) : (
            <p className="sub">Tu n&apos;as pas encore joué de match classé cette saison.</p>
          )}

          <h3 className="hh">Top {rows.length}</h3>
          <div className="hlist">
            {rows.length === 0 ? (
              <p className="sub">Personne de classé pour l&apos;instant.</p>
            ) : (
              rows.map((r, i) => (
                <div className={`hrow ${me?.userId === r.userId ? "w" : ""}`} key={r.userId}>
                  <span className="hres">#{i + 1}</span>
                  <span className="hlab">{r.name}</span>
                  <span className="hsc">{r.tierLabel}</span>
                  <span className="hdl">{r.rating}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      <div className="rowbtns" style={{ marginTop: "1.2rem" }}>
        <button className="cta ghost" onClick={onRefresh}>
          Rafraîchir
        </button>
        <button className="cta" onClick={onBack}>
          Retour
        </button>
      </div>
    </div>
  );
}
