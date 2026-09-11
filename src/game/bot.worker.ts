/// <reference lib="webworker" />
/**
 * Bot hors du thread principal (docs/PHASES.md P2 « reste à faire »).
 * `pickOrder` est une fonction pure de `src/engine/` — aucune dépendance au
 * DOM — donc elle tourne telle quelle ici. Le calcul (~250 ms au niveau 2)
 * ne bloque plus le rendu ; le résultat revient par `postMessage`.
 */
import { pickOrder } from "../engine/index";
import type { BotLevel, GameState, Order } from "../engine/index";

export interface BotRequest {
  reqId: number;
  state: GameState;
  me: 0 | 1;
  level: BotLevel;
}

export interface BotResponse {
  reqId: number;
  order: Order;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<BotRequest>) => {
  const { reqId, state, me, level } = e.data;
  const order = pickOrder(state, me, level);
  const res: BotResponse = { reqId, order };
  ctx.postMessage(res);
};
