import { useEffect, useRef } from "react";
import { Match } from "./match";
import type { MatchOpts } from "./match";

export interface MatchSessionProps {
  host: HTMLElement;
  opts: MatchOpts;
  onReady: (m: Match) => void;
}

/**
 * Construit/détruit `Match` (classe impérative, boucle `requestAnimationFrame`
 * propre, inchangée) via le cycle de vie React — étape 5 du plan de
 * migration. `opts`/`onReady` ne sont lus qu'au montage : une nouvelle
 * session est un nouvel élément côté appelant (prop `key` différente), pas
 * un changement de props sur celui-ci — les relire à chaque re-render
 * recréerait/écraserait la partie en cours pour rien.
 */
export function MatchSession({ host, opts, onReady }: MatchSessionProps) {
  const optsRef = useRef(opts);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    const m = new Match(host, optsRef.current);
    onReadyRef.current(m);
    return () => m.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  return null;
}
