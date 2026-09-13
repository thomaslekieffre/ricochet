import type { Cosmetic } from "../../net/cosmetics";

const RARITY_LABEL: Record<Cosmetic["rarity"], string> = {
  common: "Commun",
  rare: "Rare",
  epic: "Épique",
  seasonal: "Saisonnier",
};

export interface LockerScreenProps {
  loading: boolean;
  error: string | null;
  catalog: Cosmetic[];
  owned: Set<string>;
  equippedTitle: string | null;
  equippedBorder: string | null;
  onEquip: (kind: "title" | "border", slug: string | null) => void;
  onBack: () => void;
}

/** Vestiaire (docs/PHASES.md P7) — titres/bordures du pass de saison, possédés ou à débloquer par palier. */
export function LockerScreen({
  loading,
  error,
  catalog,
  owned,
  equippedTitle,
  equippedBorder,
  onEquip,
  onBack,
}: LockerScreenProps) {
  // équipé = comparé par nom (affiché tel quel sur le profil), pas par slug —
  // évite d'avoir à recharger le catalogue juste pour afficher le profil.
  const equippedName = (c: Cosmetic): string | null => (c.kind === "title" ? equippedTitle : equippedBorder);

  return (
    <div className="screen wide">
      <h2>Vestiaire</h2>
      {loading ? (
        <p className="sub">Chargement…</p>
      ) : error ? (
        <p className="sub err">{error}</p>
      ) : catalog.length === 0 ? (
        <p className="sub">Aucun cosmétique pour l&apos;instant.</p>
      ) : (
        <div className="hlist">
          {catalog.map((c) => {
            const has = owned.has(c.id);
            const equipped = has && equippedName(c) === c.name;
            return (
              <div className={`hrow ${has ? "w" : "l"}`} key={c.id}>
                <span className="hres">{has ? "✓" : "🔒"}</span>
                <span className="hlab">
                  {c.name} · {RARITY_LABEL[c.rarity]}
                  {!has && <span style={{ opacity: 0.6 }}> — palier {c.tier}</span>}
                </span>
                <span className="hsc">{c.kind === "title" ? "Titre" : "Bordure"}</span>
                <span className="hdl">
                  {has && (
                    <button className="linkbtn" onClick={() => onEquip(c.kind as "title" | "border", equipped ? null : c.name)}>
                      {equipped ? "Retirer" : "Équiper"}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <button className="cta" onClick={onBack} style={{ marginTop: "1.2rem" }}>
        Retour
      </button>
    </div>
  );
}
