import { useEffect, useRef, useState } from "react";

export interface AccountUser {
  email: string;
  name: string;
  account_xp: number;
}

export interface AccountScreenProps {
  user: AccountUser | null;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, name: string) => Promise<void>;
  onLogout: () => void;
  onBack: () => void;
}

/**
 * Écran connexion / inscription / déconnexion contre PocketBase
 * (`src/net/session.ts`). Purement présentation, ne touche jamais l'API
 * directement — `onLogin`/`onRegister` font l'appel réseau ; en cas d'erreur
 * (message renvoyé par `AuthError`), l'écran reste affiché avec le message.
 */
export function AccountScreen({ user: initialUser, onLogin, onRegister, onLogout, onBack }: AccountScreenProps) {
  const [user, setUser] = useState(initialUser);
  if (user) {
    return (
      <LoggedIn
        user={user}
        onLogout={() => {
          onLogout();
          setUser(null);
        }}
        onBack={onBack}
      />
    );
  }
  return <AuthForm onLogin={onLogin} onRegister={onRegister} onBack={onBack} />;
}

function LoggedIn({ user, onLogout, onBack }: { user: AccountUser; onLogout: () => void; onBack: () => void }) {
  return (
    <div className="screen">
      <h2>Ton compte</h2>
      <p className="sub">
        Connecté en tant que <b>{user.name || user.email}</b>
      </p>
      <p className="sub">
        {user.email} · {user.account_xp} XP de compte
      </p>
      <div className="rowbtns" style={{ marginTop: "1.1rem" }}>
        <button className="cta ghost danger" onClick={onLogout}>
          Se déconnecter
        </button>
      </div>
      <button className="cta" style={{ marginTop: "0.7rem" }} onClick={onBack}>
        Retour
      </button>
    </div>
  );
}

function AuthForm({
  onLogin,
  onRegister,
  onBack,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string, name: string) => Promise<void>;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (nameRef.current ?? emailRef.current)?.focus();
  }, [mode]);

  const submit = async (): Promise<void> => {
    const emailTrim = email.trim();
    if (!emailTrim || !password) {
      setError("Email et mot de passe requis.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "login") {
        await onLogin(emailTrim, password);
      } else {
        await onRegister(emailTrim, password, name.trim() || emailTrim.split("@")[0]!);
      }
      onBack();
    } catch (e) {
      setBusy(false);
      setError((e as Error).message || "Échec — vérifie tes identifiants.");
    }
  };

  return (
    <div className="screen">
      <h2>{mode === "login" ? "Se connecter" : "Créer un compte"}</h2>
      <p className="sub">
        Compte PocketBase — synchronise ta note classée entre navigateurs. Jouer sans compte reste possible (bot,
        hotseat, en ligne non identifié).
      </p>
      {mode === "register" && (
        <input
          ref={nameRef}
          className="tin"
          maxLength={16}
          autoComplete="username"
          spellCheck={false}
          placeholder="Pseudo"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      )}
      <input
        ref={emailRef}
        className="tin"
        type="email"
        autoComplete="email"
        spellCheck={false}
        placeholder="Email"
        style={{ marginTop: "0.5rem" }}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="tin"
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        placeholder="Mot de passe"
        style={{ marginTop: "0.5rem" }}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
      />
      <p className="sub err">{error || " "}</p>
      <div className="rowbtns">
        <button className="cta" disabled={busy} onClick={() => void submit()}>
          {busy ? "…" : mode === "login" ? "Se connecter" : "Créer le compte"}
        </button>
        <button className="cta ghost" onClick={onBack}>
          Retour
        </button>
      </div>
      <button
        className="linkbtn"
        style={{ marginTop: "0.9rem" }}
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError("");
        }}
      >
        {mode === "login" ? "Pas de compte ? En créer un" : "Déjà un compte ? Se connecter"}
      </button>
    </div>
  );
}
