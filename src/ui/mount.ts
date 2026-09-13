/**
 * Propriétaire du DOM de `#overlay` — seul point qui bascule entre les
 * écrans « legacy » (chaîne HTML, `show()`) et les écrans React
 * (`showReact()`), pendant la migration incrémentale de src/game/ui.ts.
 *
 * Les deux modes ne doivent jamais se mélanger sur le même montage : basculer
 * de l'un à l'autre démonte toujours proprement l'arbre React actif avant de
 * réutiliser le conteneur, sinon React perd la trace du DOM qu'il croit gérer.
 */
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";

function overlayEl(): HTMLElement {
  const el = document.getElementById("overlay");
  if (!el) throw new Error("#overlay introuvable");
  return el;
}

let activeRoot: Root | null = null;

function unmountReact(): void {
  if (activeRoot) {
    activeRoot.unmount();
    activeRoot = null;
  }
}

/** Écran legacy (chaîne HTML) — remplace tout contenu précédent, React inclus. */
export function show(html: string): HTMLElement {
  unmountReact();
  const el = overlayEl();
  el.innerHTML = html;
  el.hidden = false;
  return el;
}

/** Écran React — remplace tout contenu précédent, HTML legacy inclus. */
export function showReact(node: ReactElement): void {
  unmountReact();
  const el = overlayEl();
  el.innerHTML = "";
  el.hidden = false;
  activeRoot = createRoot(el);
  activeRoot.render(node);
}

export function hideOverlay(): void {
  unmountReact();
  const el = overlayEl();
  el.innerHTML = "";
  el.hidden = true;
}
