/**
 * Wire protocol between the browser client and the authoritative match server
 * (docs/PHASES.md P3). JSON, one object per WebSocket message.
 *
 * Shared by `src/net/client.ts` and `server/server.ts` — the engine's
 * `resolve()` runs on the server; the client only animates the frames it sends.
 */

import type {
  Frame,
  GameState,
  HeroKind,
  Order,
  TurnEvent,
} from "../engine/index";

export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 8787;

export interface QueueSetup {
  arenaId: string;
  /** Token d'auth PocketBase courant (`Session.token()`), absent si non connecté — voir P4. */
  token?: string;
}

export interface LiveMatchInfo {
  matchId: string;
  arenaId: string;
  turn: number;
}

/* ---- client -> server ---- */
export type ClientMsg =
  | { t: "hello"; v: number }
  | { t: "queue"; setup: QueueSetup }
  | { t: "cancel" }
  | { t: "ban"; matchId: string; hero: HeroKind }
  | { t: "pick"; matchId: string; team: [HeroKind, HeroKind, HeroKind] }
  | { t: "order"; matchId: string; turn: number; order: Order }
  | { t: "ready"; matchId: string; turn: number }
  /**
   * Deux usages : `client.match` déjà attribué côté serveur (connexion jamais
   * vraiment coupée) -> simple rafraîchissement, `seat`/`resumeToken` ignorés.
   * Connexion WebSocket neuve après une vraie coupure (`client.match` reparti
   * à `null`) -> `seat` + `resumeToken` (reçus dans `matched`) permettent de
   * ré-attacher ce nouveau client au match toujours en grâce côté serveur
   * (voir `Match.onDisconnect`/`Match.reattach`, docs/PHASES.md).
   */
  | { t: "resync"; matchId: string; seat?: 0 | 1; resumeToken?: string }
  | { t: "listMatches" }
  | { t: "spectate"; matchId: string }
  | { t: "ping"; n: number };

/* ---- server -> client ---- */
export type ServerMsg =
  | { t: "welcome"; v: number }
  | { t: "queued" }
  | { t: "paired"; matchId: string; seat: 0 | 1 }
  | {
      t: "draft";
      matchId: string;
      phase: "ban" | "pick";
      pool: HeroKind[];
      deadlineMs: number;
    }
  | {
      t: "matched";
      matchId: string;
      seat: 0 | 1;
      state: GameState;
      deadlineMs: number;
      /** À renvoyer dans `resync` pour se ré-attacher au match après une vraie coupure réseau. */
      resumeToken: string;
    }
  | {
      t: "turn";
      turn: number;
      frames: Frame[];
      events: TurnEvent[];
      state: GameState;
      ordersPlayed: [Order, Order];
      hash: string;
      deadlineMs: number;
    }
  | { t: "state"; matchId: string; state: GameState; turn: number; deadlineMs: number }
  | { t: "opponentLeft"; matchId: string }
  | { t: "over"; matchId: string; winner: 0 | 1 }
  | { t: "matchList"; matches: LiveMatchInfo[] }
  | { t: "spectating"; matchId: string; state: GameState }
  | { t: "spectateEnded"; matchId: string; winner: 0 | 1 | null }
  | { t: "error"; msg: string }
  | { t: "pong"; n: number };

export const encode = (m: ClientMsg | ServerMsg): string => JSON.stringify(m);
export const decode = <T>(raw: string): T => JSON.parse(raw) as T;
