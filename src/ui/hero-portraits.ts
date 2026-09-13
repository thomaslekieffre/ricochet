/**
 * Portraits héros (pose idle) pour les écrans hors match — menu, codex — qui
 * n'ont pas accès au canvas PixiJS. Réutilise les mêmes PNG détourés que
 * `src/game/renderer.ts`, sans dupliquer le mapping complet idle/hit/ko qui
 * n'a de sens que pendant un match.
 */
import type { HeroKind } from "../engine/index";

import arcUrl from "../assets/heroes/arc.png";
import boulderUrl from "../assets/heroes/boulder.png";
import cometUrl from "../assets/heroes/comet.png";
import hookUrl from "../assets/heroes/hook.png";
import prismUrl from "../assets/heroes/prism.png";
import ramUrl from "../assets/heroes/ram.png";
import slingUrl from "../assets/heroes/sling.png";
import vexUrl from "../assets/heroes/vex.png";

export const HERO_PORTRAIT: Record<HeroKind, string> = {
  boulder: boulderUrl,
  ram: ramUrl,
  comet: cometUrl,
  hook: hookUrl,
  sling: slingUrl,
  prism: prismUrl,
  vex: vexUrl,
  arc: arcUrl,
};
