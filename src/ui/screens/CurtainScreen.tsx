export interface CurtainScreenProps {
  text: string;
  onGo: () => void;
}

export function CurtainScreen({ text, onGo }: CurtainScreenProps) {
  return (
    <div className="screen curtain">
      <p className="curtain-to">au tour de</p>
      <h2>{text}</h2>
      <button className="cta" onClick={onGo}>
        Continuer
      </button>
    </div>
  );
}
