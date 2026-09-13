import { useEffect, useRef, useState } from "react";
import { isNameValid, sanitizeName } from "../../lib/profile";

export interface NameScreenProps {
  initial: string;
  onDone: (name: string) => void;
  onCancel?: () => void;
}

export function NameScreen({ initial, onDone, onCancel }: NameScreenProps) {
  const [value, setValue] = useState(initial);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (): void => {
    if (!isNameValid(value)) {
      setErr("Entre un pseudo de 3 à 16 caractères.");
      return;
    }
    onDone(sanitizeName(value));
  };

  return (
    <div className="screen">
      <h2>Ton pseudo</h2>
      <p className="sub">3 à 16 caractères. Il identifie ton profil sur ce navigateur.</p>
      <input
        ref={inputRef}
        className="tin"
        maxLength={16}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="ex. Zoe"
      />
      <p className="sub err">{err || " "}</p>
      <div className="rowbtns">
        <button className="cta" onClick={submit}>
          Valider
        </button>
        {onCancel && (
          <button className="cta ghost" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}
