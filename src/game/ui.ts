import { createElement } from "react";
import type { HeroKind } from "../engine/index";
import { hideOverlay, show, showReact } from "../ui/mount";
import { BanPickScreen } from "../ui/screens/BanPickScreen";
import { CodexScreen } from "../ui/screens/CodexScreen";
import { CurtainScreen } from "../ui/screens/CurtainScreen";
import { MenuScreen } from "../ui/screens/MenuScreen";
import type { MenuChip } from "../ui/screens/MenuScreen";
import { NameScreen } from "../ui/screens/NameScreen";
import { NoticeScreen } from "../ui/screens/NoticeScreen";
import { OnlineDraftScreen } from "../ui/screens/OnlineDraftScreen";
import { ProfileScreen } from "../ui/screens/ProfileScreen";
import type { HistoryRow, ProfileView } from "../ui/screens/ProfileScreen";
import { ResultScreen } from "../ui/screens/ResultScreen";
import { SearchingScreen } from "../ui/screens/SearchingScreen";
import { SpectateListScreen } from "../ui/screens/SpectateListScreen";
import type { SpectateRow } from "../ui/screens/SpectateListScreen";

export { hideOverlay };
export type { SpectateRow };

/** Échappe le texte fourni par le joueur (pseudo) avant injection HTML. */
export function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export interface StartOpts {
  mode: "bot" | "hotseat" | "online";
  botLevel: 1 | 2 | 3;
  arenaId: string;
}

export type { MenuChip };

// ---- menu : un lanceur, pas un formulaire -----------------------------

export function menuScreen(
  chip: MenuChip | null,
  onStart: (o: StartOpts) => void,
  onReplay: () => void,
  onProfile: () => void,
  onCodex: () => void,
  onSpectate: () => void,
): void {
  showReact(
    createElement(MenuScreen, {
      chip,
      onStart: (o: StartOpts) => {
        hideOverlay();
        onStart(o);
      },
      onReplay: () => {
        hideOverlay();
        onReplay();
      },
      onProfile: () => {
        hideOverlay();
        onProfile();
      },
      onCodex: () => {
        hideOverlay();
        onCodex();
      },
      onSpectate: () => {
        hideOverlay();
        onSpectate();
      },
    }),
  );
}

/**
 * Draft ban/pick pour les modes locaux (docs/PHASES.md P6, version hotseat/bot).
 * Chaque camp bannit 1 héros du pool commun, puis compose 3 héros parmi les
 * restants (les compos peuvent se recouper). Le bot bannit et compose au hasard.
 */
export function banPickScreen(
  hotseat: boolean,
  onDone: (teamA: HeroKind[], teamB: HeroKind[]) => void,
): void {
  showReact(
    createElement(BanPickScreen, {
      hotseat,
      onDone: (teamA: HeroKind[], teamB: HeroKind[]) => {
        hideOverlay();
        onDone(teamA, teamB);
      },
    }),
  );
}

/**
 * Draft en ligne (docs/PHASES.md P6) : pilotée par le serveur — un `draft`
 * (ban, puis pick) à la fois, un seul appel par message reçu. Une fois le
 * choix envoyé, l'écran se fige sur "en attente de l'adversaire" jusqu'au
 * prochain message serveur (`draft` de la phase suivante, ou `matched`).
 */
export function onlineDraftScreen(
  phase: "ban" | "pick",
  pool: HeroKind[],
  onBan: (hero: HeroKind) => void,
  onPick: (team: HeroKind[]) => void,
  onCancel: () => void,
): void {
  showReact(createElement(OnlineDraftScreen, { phase, pool, onBan, onPick, onCancel }));
}

/** Codex : les six fiches, dans les mots exacts de la barre d'action en match. */
export function codexScreen(onBack: () => void): void {
  showReact(
    createElement(CodexScreen, {
      onBack: () => {
        hideOverlay();
        onBack();
      },
    }),
  );
}

// ---- profil ----------------------------------------------------------

export function nameScreen(
  initial: string,
  onDone: (name: string) => void,
  onCancel?: () => void,
): void {
  showReact(
    createElement(NameScreen, {
      initial,
      onDone: (name: string) => {
        hideOverlay();
        onDone(name);
      },
      onCancel: onCancel
        ? () => {
            hideOverlay();
            onCancel();
          }
        : undefined,
    }),
  );
}

export type { HistoryRow, ProfileView };

export function profileScreen(
  v: ProfileView,
  onBack: () => void,
  onRename: () => void,
  onReset: () => void,
  onAccount: () => void,
  accountLine: string,
): void {
  showReact(
    createElement(ProfileScreen, {
      view: v,
      accountLine,
      onBack: () => {
        hideOverlay();
        onBack();
      },
      onRename: () => {
        hideOverlay();
        onRename();
      },
      onReset: () => {
        hideOverlay();
        onReset();
      },
      onAccount: () => {
        hideOverlay();
        onAccount();
      },
    }),
  );
}

export function resultScreen(
  title: string,
  sub: string,
  onRematch: () => void,
  onMenu: () => void,
  onDownloadReplay?: () => void,
  progressHtml?: string,
  tone: "win" | "loss" | "neutral" = "neutral",
): void {
  showReact(
    createElement(ResultScreen, {
      title,
      sub,
      progressHtml,
      tone,
      onRematch: () => {
        hideOverlay();
        onRematch();
      },
      onMenu: () => {
        hideOverlay();
        onMenu();
      },
      onDownloadReplay,
    }),
  );
}

export function curtain(text: string, onGo: () => void): void {
  showReact(
    createElement(CurtainScreen, {
      text,
      onGo: () => {
        hideOverlay();
        onGo();
      },
    }),
  );
}

export function searchingScreen(onCancel: () => void): void {
  showReact(
    createElement(SearchingScreen, {
      onCancel: () => {
        hideOverlay();
        onCancel();
      },
    }),
  );
}

/** Liste des matchs en direct (docs/PHASES.md P6). Rafraîchissable, lecture seule. */
export function spectateListScreen(
  rows: SpectateRow[],
  onWatch: (matchId: string) => void,
  onRefresh: () => void,
  onCancel: () => void,
): void {
  showReact(
    createElement(SpectateListScreen, {
      rows,
      onWatch: (matchId: string) => {
        hideOverlay();
        onWatch(matchId);
      },
      onRefresh,
      onCancel: () => {
        hideOverlay();
        onCancel();
      },
    }),
  );
}

// ---- compte PocketBase (docs/PHASES.md P4) ----------------------------

export interface AccountUser {
  email: string;
  name: string;
  account_xp: number;
}

/**
 * Écran connexion / inscription / déconnexion contre PocketBase
 * (`src/net/session.ts`). Purement DOM, ne touche jamais l'API directement —
 * `onLogin`/`onRegister` font l'appel réseau et relancent l'écran en cas
 * d'erreur (message renvoyé par `AuthError`).
 */
export function accountScreen(
  user: AccountUser | null,
  onLogin: (email: string, password: string) => Promise<void>,
  onRegister: (email: string, password: string, name: string) => Promise<void>,
  onLogout: () => void,
  onBack: () => void,
): void {
  let mode: "login" | "register" = "login";
  let error = "";
  let busy = false;

  const render = (): void => {
    if (user) {
      const el = show(`
        <div class="screen">
          <h2>Ton compte</h2>
          <p class="sub">Connecté en tant que <b>${esc(user.name || user.email)}</b></p>
          <p class="sub">${esc(user.email)} · ${user.account_xp} XP de compte</p>
          <div class="rowbtns" style="margin-top:1.1rem">
            <button class="cta ghost danger" id="logout">Se déconnecter</button>
          </div>
          <button class="cta" id="back" style="margin-top:0.7rem">Retour</button>
        </div>
      `);
      el.querySelector("#logout")!.addEventListener("click", () => {
        onLogout();
        user = null;
        render();
      });
      el.querySelector("#back")!.addEventListener("click", () => {
        hideOverlay();
        onBack();
      });
      return;
    }

    const el = show(`
      <div class="screen">
        <h2>${mode === "login" ? "Se connecter" : "Créer un compte"}</h2>
        <p class="sub">Compte PocketBase — synchronise ta note classée entre navigateurs.
          Jouer sans compte reste possible (bot, hotseat, en ligne non identifié).</p>
        ${mode === "register" ? `<input id="aname" class="tin" maxlength="16" autocomplete="username" spellcheck="false" placeholder="Pseudo" />` : ""}
        <input id="aemail" class="tin" type="email" autocomplete="email" spellcheck="false" placeholder="Email" style="margin-top:0.5rem" />
        <input id="apass" class="tin" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" placeholder="Mot de passe" style="margin-top:0.5rem" />
        <p class="sub err" id="aerr">${esc(error)}&nbsp;</p>
        <div class="rowbtns">
          <button class="cta" id="go" ${busy ? "disabled" : ""}>${busy ? "…" : mode === "login" ? "Se connecter" : "Créer le compte"}</button>
          <button class="cta ghost" id="back">Retour</button>
        </div>
        <button class="linkbtn" id="swap" style="margin-top:0.9rem">${mode === "login" ? "Pas de compte ? En créer un" : "Déjà un compte ? Se connecter"}</button>
      </div>
    `);

    const emailIn = el.querySelector<HTMLInputElement>("#aemail")!;
    const passIn = el.querySelector<HTMLInputElement>("#apass")!;
    const nameIn = el.querySelector<HTMLInputElement>("#aname");

    const submit = async (): Promise<void> => {
      const email = emailIn.value.trim();
      const password = passIn.value;
      if (!email || !password) {
        error = "Email et mot de passe requis.";
        render();
        return;
      }
      busy = true;
      error = "";
      render();
      try {
        if (mode === "login") {
          await onLogin(email, password);
        } else {
          const name = nameIn?.value.trim() || email.split("@")[0]!;
          await onRegister(email, password, name);
        }
        hideOverlay();
        onBack();
      } catch (e) {
        busy = false;
        error = (e as Error).message || "Échec — vérifie tes identifiants.";
        render();
      }
    };

    el.querySelector("#go")!.addEventListener("click", () => void submit());
    passIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void submit();
    });
    el.querySelector("#swap")!.addEventListener("click", () => {
      mode = mode === "login" ? "register" : "login";
      error = "";
      render();
    });
    el.querySelector("#back")!.addEventListener("click", () => {
      hideOverlay();
      onBack();
    });
    setTimeout(() => (nameIn ?? emailIn).focus(), 0);
  };

  render();
}

export function noticeScreen(title: string, sub: string, onOk: () => void): void {
  showReact(
    createElement(NoticeScreen, {
      title,
      sub,
      onOk: () => {
        hideOverlay();
        onOk();
      },
    }),
  );
}
