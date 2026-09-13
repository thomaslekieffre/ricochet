import { useEffect, useRef } from "react";
import { ReplayPlayer } from "./replay-player";
import type { RecordedMatch } from "./replay";
import type { HudEls } from "./MatchHud";

export interface ReplaySessionProps {
  host: HTMLElement;
  rec: RecordedMatch;
  hud: HudEls;
  onExit: () => void;
}

/** Construit/détruit `ReplayPlayer` via le cycle de vie React — cf. `MatchSession`. */
export function ReplaySession({ host, rec, hud, onExit }: ReplaySessionProps) {
  const recRef = useRef(rec);
  const onExitRef = useRef(onExit);

  useEffect(() => {
    const r = new ReplayPlayer(host, recRef.current, () => onExitRef.current(), hud);
    return () => r.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, hud]);

  return null;
}
