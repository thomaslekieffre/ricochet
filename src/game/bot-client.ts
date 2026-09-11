/**
 * Wrapper autour du Web Worker du bot (docs/PHASES.md P2). Un `BotClient` par
 * match : garde le worker vivant d'un tour à l'autre plutôt que d'en recréer
 * un à chaque coup, et route les réponses par `reqId` (au cas où deux appels
 * se chevaucheraient — ne devrait pas arriver en pratique, un seul coup à la
 * fois est demandé).
 */
import type { BotLevel, GameState, Order } from "../engine/index";
import type { BotRequest, BotResponse } from "./bot.worker";

export class BotClient {
  private worker: Worker;
  private reqId = 0;
  private pending = new Map<number, (order: Order) => void>();

  constructor() {
    this.worker = new Worker(new URL("./bot.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (e: MessageEvent<BotResponse>) => {
      const resolve = this.pending.get(e.data.reqId);
      if (!resolve) return;
      this.pending.delete(e.data.reqId);
      resolve(e.data.order);
    };
  }

  pick(state: GameState, me: 0 | 1, level: BotLevel): Promise<Order> {
    const reqId = ++this.reqId;
    const req: BotRequest = { reqId, state, me, level };
    return new Promise((resolve) => {
      this.pending.set(reqId, resolve);
      this.worker.postMessage(req);
    });
  }

  dispose(): void {
    this.pending.clear();
    this.worker.terminate();
  }
}
