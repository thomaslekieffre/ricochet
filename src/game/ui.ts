import { createElement } from "react";
import type { HeroKind } from "../engine/index";
import { hideOverlay, showReact } from "../ui/mount";
import { AccountScreen } from "../ui/screens/AccountScreen";
import type { AccountUser } from "../ui/screens/AccountScreen";
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

export type { AccountUser };

/**
 * Écran connexion / inscription / déconnexion contre PocketBase
 * (`src/net/session.ts`). Purement présentation, ne touche jamais l'API
 * directement — `onLogin`/`onRegister` font l'appel réseau et l'écran
 * affiche l'erreur en cas d'échec (message renvoyé par `AuthError`).
 */
export function accountScreen(
  user: AccountUser | null,
  onLogin: (email: string, password: string) => Promise<void>,
  onRegister: (email: string, password: string, name: string) => Promise<void>,
  onLogout: () => void,
  onBack: () => void,
): void {
  showReact(
    createElement(AccountScreen, {
      user,
      onLogin,
      onRegister,
      onLogout,
      onBack: () => {
        hideOverlay();
        onBack();
      },
    }),
  );
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
