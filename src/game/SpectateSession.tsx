import { useEffect, useRef } from "react";
import { SpectateView } from "./spectate-view";
import type { NetClient } from "../net/client";
import type { GameState } from "../engine/index";
import type { HudEls } from "./MatchHud";

export interface SpectateSessionProps {
  host: HTMLElement;
  client: NetClient;
  initialState: GameState;
  hud: HudEls;
  onExit: () => void;
}

/** Construit/détruit `SpectateView` via le cycle de vie React — cf. `MatchSession`. */
export function SpectateSession({ host, client, initialState, hud, onExit }: SpectateSessionProps) {
  const clientRef = useRef(client);
  const initialStateRef = useRef(initialState);
  const onExitRef = useRef(onExit);

  useEffect(() => {
    const s = new SpectateView(host, clientRef.current, initialStateRef.current, () => onExitRef.current(), hud);
    return () => s.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host, hud]);

  return null;
}
