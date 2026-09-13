/**
 * Point de montage React dédié au rideau hotseat (`curtain()` dans
 * `src/game/ui.ts`), affiché par-dessus le canvas pendant un match.
 *
 * C'est un root React séparé de celui de `App` (monté sur `#overlay`,
 * cf. `src/main.tsx`) : `Match` (classe impérative, inchangée depuis
 * l'étape 3 du plan de migration) appelle `curtain()` directement pendant
 * la partie, hors du cycle de rendu d'`App` — les deux ne doivent jamais
 * partager le même conteneur DOM, sous peine de voir un root React en
 * démonter un autre par erreur.
 */
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";

function curtainEl(): HTMLElement {
  const el = document.getElementById("curtain");
  if (!el) throw new Error("#curtain introuvable");
  return el;
}

let activeRoot: Root | null = null;

export function showCurtain(node: ReactElement): void {
  if (activeRoot) activeRoot.unmount();
  const el = curtainEl();
  el.innerHTML = "";
  el.hidden = false;
  activeRoot = createRoot(el);
  activeRoot.render(node);
}

export function hideCurtain(): void {
  if (activeRoot) {
    activeRoot.unmount();
    activeRoot = null;
  }
  const el = curtainEl();
  el.innerHTML = "";
  el.hidden = true;
}
