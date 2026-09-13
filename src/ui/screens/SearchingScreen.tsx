export interface SearchingScreenProps {
  onCancel: () => void;
}

export function SearchingScreen({ onCancel }: SearchingScreenProps) {
  return (
    <div className="screen">
      <h2>Recherche d&apos;un adversaire…</h2>
      <p className="sub">On te place dès qu&apos;un joueur est disponible.</p>
      <button className="cta ghost" onClick={onCancel}>
        Annuler
      </button>
    </div>
  );
}
