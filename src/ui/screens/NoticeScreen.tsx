export interface NoticeScreenProps {
  title: string;
  sub: string;
  onOk: () => void;
}

export function NoticeScreen({ title, sub, onOk }: NoticeScreenProps) {
  return (
    <div className="screen">
      <h2>{title}</h2>
      <p className="sub">{sub}</p>
      <button className="cta" onClick={onOk}>
        Retour au menu
      </button>
    </div>
  );
}
