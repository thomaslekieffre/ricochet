export interface NoticeScreenProps {
  title: string;
  sub: string;
  onOk: () => void;
}

export function NoticeScreen({ title, sub, onOk }: NoticeScreenProps) {
  return (
    <div className="screen">
      <h2>{title}</h2>
      {/* `sub` porte parfois du HTML volontaire (ex. "Lance <code>npm run
          server</code>…") — même comportement que le show() legacy qu'il
          remplace. Les appelants restent tous des chaînes développeur ou
          Error.message, jamais du texte saisi par un joueur. */}
      <p className="sub" dangerouslySetInnerHTML={{ __html: sub }} />
      <button className="cta" onClick={onOk}>
        Retour au menu
      </button>
    </div>
  );
}
