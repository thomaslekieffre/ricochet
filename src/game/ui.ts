import { createElement } from "react";
import { showCurtain, hideCurtain } from "../ui/mount";
import { CurtainScreen } from "../ui/screens/CurtainScreen";

export interface StartOpts {
  mode: "bot" | "hotseat" | "online";
  botLevel: 1 | 2 | 3;
  arenaId: string;
}

/**
 * Rideau hotseat ("au tour de Joueur X") affiché par-dessus le canvas entre
 * deux tours — appelé directement par `Match` (classe impérative), pas par
 * `App` : c'est le seul écran restant hors de la state machine de `App.tsx`,
 * cf. `src/ui/mount.ts`.
 */
export function curtain(text: string, onGo: () => void): void {
  showCurtain(
    createElement(CurtainScreen, {
      text,
      onGo: () => {
        hideCurtain();
        onGo();
      },
    }),
  );
}
