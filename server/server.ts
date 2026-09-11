/**
 * Authoritative match server (docs/PHASES.md P3). Node + ws, run with `npm run server`.
 *
 * - Holds the true GameState for every live match.
 * - Clients send only their own `Order`; the server validates it, runs the shared
 *   `resolve()` and broadcasts the resulting frames + state + hash.
 * - No accounts, no persistence yet — that is Phase 4.
 */

import { createServer, type Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { hashState, newMatch, resolve, ROSTER } from "../src/engine/index";
import type { GameState, HeroKind, Order } from "../src/engine/index";
import {
  DEFAULT_PORT,
  PROTOCOL_VERSION,
  encode,
  type ClientMsg,
  type QueueSetup,
  type ServerMsg,
} from "../src/net/protocol";

const TURN_DEADLINE_MS = 12_000;
const ANIM_GRACE_MS = 9_000;
const DRAFT_BAN_MS = 15_000;
const DRAFT_PICK_MS = 25_000;

const HOLD: Order = { bodyId: -1, angleIdx: 0, power: 0, ability: false, hold: true };

let nextId = 1;

interface Client {
  id: number;
  ws: WebSocket;
  setup: QueueSetup | null;
  draft: Draft | null;
  match: Match | null;
  seat: 0 | 1;
  alive: boolean;
}

function send(c: Client, msg: ServerMsg): void {
  if (c.ws.readyState === c.ws.OPEN) c.ws.send(encode(msg));
}

function randomHero(pool: HeroKind[]): HeroKind {
  return pool[Math.floor(Math.random() * pool.length)]!;
}

function randomTeam(pool: HeroKind[]): [HeroKind, HeroKind, HeroKind] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return [shuffled[0]!, shuffled[1]!, shuffled[2]!];
}

/**
 * Ban/pick en ligne (docs/PHASES.md P6) : chaque camp bannit 1 héros du pool
 * commun (simultané), puis compose 3 héros parmi les restants (simultané,
 * les compos peuvent se recouper). Timeout à chaque phase -> choix aléatoire
 * pour le retardataire, comme le bot en local.
 */
class Draft {
  private bans: [HeroKind | null, HeroKind | null] = [null, null];
  private picks: [HeroKind[] | null, HeroKind[] | null] = [null, null];
  private phase: "ban" | "pick" = "ban";
  private pool: HeroKind[] = [...ROSTER];
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    readonly id: string,
    private seats: [Client, Client],
    private arenaId: string,
    private onDone: (teamA: HeroKind[], teamB: HeroKind[], arenaId: string) => void,
  ) {
    const [a, b] = seats;
    a.seat = 0;
    b.seat = 1;
    a.draft = this;
    b.draft = this;
    this.beginBan();
  }

  private arm(ms: number, fn: () => void): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(fn, ms);
  }

  private beginBan(): void {
    const deadlineMs = Date.now() + DRAFT_BAN_MS;
    this.arm(DRAFT_BAN_MS, () => this.forceBan());
    for (const c of this.seats) {
      send(c, { t: "draft", matchId: this.id, phase: "ban", pool: this.pool, deadlineMs });
    }
  }

  onBan(seat: 0 | 1, hero: HeroKind): void {
    if (this.closed || this.phase !== "ban" || !this.pool.includes(hero)) return;
    this.bans[seat] = hero;
    if (this.bans[0] && this.bans[1]) this.finishBan();
  }

  private forceBan(): void {
    for (const s of [0, 1] as const) {
      if (!this.bans[s]) this.bans[s] = randomHero(this.pool);
    }
    this.finishBan();
  }

  private finishBan(): void {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    this.phase = "pick";
    const banned = new Set(this.bans.filter((h): h is HeroKind => h !== null));
    this.pool = ROSTER.filter((h) => !banned.has(h));
    const deadlineMs = Date.now() + DRAFT_PICK_MS;
    this.arm(DRAFT_PICK_MS, () => this.forcePick());
    for (const c of this.seats) {
      send(c, { t: "draft", matchId: this.id, phase: "pick", pool: this.pool, deadlineMs });
    }
  }

  onPick(seat: 0 | 1, team: HeroKind[]): void {
    if (this.closed || this.phase !== "pick") return;
    const valid =
      team.length === 3 &&
      new Set(team).size === 3 &&
      team.every((h) => this.pool.includes(h));
    if (!valid) return;
    this.picks[seat] = team;
    if (this.picks[0] && this.picks[1]) this.finish();
  }

  private forcePick(): void {
    for (const s of [0, 1] as const) {
      if (!this.picks[s]) this.picks[s] = randomTeam(this.pool);
    }
    this.finish();
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const c of this.seats) c.draft = null;
    this.onDone(this.picks[0]!, this.picks[1]!, this.arenaId);
  }

  onLeave(c: Client): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    const other = this.seats[c.seat === 0 ? 1 : 0];
    other.draft = null;
    send(other, { t: "opponentLeft", matchId: this.id });
  }
}

class Match {
  state: GameState;
  private pending: [Order | null, Order | null] = [null, null];
  private ready = new Set<0 | 1>();
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    readonly id: string,
    private seats: [Client, Client],
    teamA: HeroKind[],
    teamB: HeroKind[],
    arenaId: string,
  ) {
    const [a, b] = seats;
    a.match = this;
    b.match = this;
    this.state = newMatch({
      teamA: teamA as [HeroKind, HeroKind, HeroKind],
      teamB: teamB as [HeroKind, HeroKind, HeroKind],
      arena: arenaId,
    });
    this.beginTurn(true);
  }

  private beginTurn(first = false): void {
    if (this.closed) return;
    this.pending = [null, null];
    this.ready.clear();
    const deadlineMs = Date.now() + TURN_DEADLINE_MS;
    this.arm(TURN_DEADLINE_MS, () => this.resolveTurn());
    for (const c of this.seats) {
      if (first) {
        send(c, { t: "matched", matchId: this.id, seat: c.seat, state: this.state, deadlineMs });
      } else {
        send(c, { t: "state", matchId: this.id, state: this.state, turn: this.state.turn, deadlineMs });
      }
    }
  }

  private arm(ms: number, fn: () => void): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(fn, ms);
  }

  onOrder(seat: 0 | 1, turn: number, order: Order): void {
    if (this.closed || turn !== this.state.turn) return;
    this.pending[seat] = this.sanitize(seat, order);
    if (this.pending[0] && this.pending[1]) this.resolveTurn();
  }

  private sanitize(seat: 0 | 1, order: Order): Order {
    if (order.hold || order.bodyId < 0) return { ...HOLD };
    const body = this.state.bodies.find(
      (b) => b.id === order.bodyId && b.owner === seat && b.alive,
    );
    if (!body) return { ...HOLD };
    return {
      bodyId: order.bodyId,
      angleIdx: order.angleIdx | 0,
      power: Math.max(0, Math.min(order.power | 0, 65536)),
      ability: !!order.ability,
    };
  }

  private resolveTurn(): void {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    const a = this.pending[0] ?? { ...HOLD };
    const b = this.pending[1] ?? { ...HOLD };
    const res = resolve(this.state, a, b);
    this.state = res.state;
    const deadlineMs = Date.now() + ANIM_GRACE_MS + TURN_DEADLINE_MS;
    const hash = hashState(this.state);
    for (const c of this.seats) {
      send(c, {
        t: "turn",
        turn: this.state.turn - 1,
        frames: res.frames,
        events: res.events,
        state: this.state,
        ordersPlayed: [a, b],
        hash,
        deadlineMs,
      });
    }
    if (this.state.over && this.state.winner !== null) {
      for (const c of this.seats) {
        send(c, { t: "over", matchId: this.id, winner: this.state.winner });
      }
      this.close();
      return;
    }
    // move on once both are ready, or after a grace period regardless
    this.arm(ANIM_GRACE_MS, () => this.beginTurn());
  }

  onReady(seat: 0 | 1, turn: number): void {
    if (this.closed || turn !== this.state.turn - 1) return;
    this.ready.add(seat);
    if (this.ready.size === 2) this.beginTurn();
  }

  onLeave(c: Client): void {
    if (this.closed) return;
    const other = this.seats[c.seat === 0 ? 1 : 0];
    send(other, { t: "opponentLeft", matchId: this.id });
    if (!this.state.over) {
      send(other, { t: "over", matchId: this.id, winner: other.seat });
    }
    this.close();
  }

  resync(c: Client): void {
    send(c, {
      t: "state",
      matchId: this.id,
      state: this.state,
      turn: this.state.turn,
      deadlineMs: Date.now() + TURN_DEADLINE_MS,
    });
  }

  private close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    for (const c of this.seats) c.match = null;
  }
}

export function createMatchServer(port = DEFAULT_PORT): { http: Server; close: () => void } {
  const waiting: Client[] = [];

  const http = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, waiting: waiting.length, matches: nextId - 1 }));
      return;
    }
    res.writeHead(426);
    res.end("upgrade required");
  });

  const wss = new WebSocketServer({ server: http });

  const tryMatch = () => {
    while (waiting.length >= 2) {
      const a = waiting.shift()!;
      const b = waiting.shift()!;
      if (!a.alive) {
        waiting.unshift(b);
        continue;
      }
      if (!b.alive) {
        waiting.unshift(a);
        continue;
      }
      const id = `m${nextId++}`;
      a.seat = 0;
      b.seat = 1;
      send(a, { t: "paired", matchId: id, seat: 0 });
      send(b, { t: "paired", matchId: id, seat: 1 });
      // seat 0 picks the arena, comme avant l'introduction du draft
      new Draft(id, [a, b], a.setup!.arenaId, (teamA, teamB, arenaId) => {
        new Match(id, [a, b], teamA, teamB, arenaId);
      });
    }
  };

  wss.on("connection", (ws: WebSocket) => {
    const client: Client = {
      id: nextId++,
      ws,
      setup: null,
      draft: null,
      match: null,
      seat: 0,
      alive: true,
    };
    send(client, { t: "welcome", v: PROTOCOL_VERSION });

    ws.on("message", (raw: Buffer) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.t) {
        case "hello":
          send(client, { t: "welcome", v: PROTOCOL_VERSION });
          break;
        case "queue":
          if (client.match) return;
          client.setup = msg.setup;
          if (!waiting.includes(client)) waiting.push(client);
          send(client, { t: "queued" });
          tryMatch();
          break;
        case "cancel": {
          const i = waiting.indexOf(client);
          if (i >= 0) waiting.splice(i, 1);
          break;
        }
        case "ban":
          client.draft?.onBan(client.seat, msg.hero);
          break;
        case "pick":
          client.draft?.onPick(client.seat, msg.team);
          break;
        case "order":
          client.match?.onOrder(client.seat, msg.turn, msg.order);
          break;
        case "ready":
          client.match?.onReady(client.seat, msg.turn);
          break;
        case "resync":
          client.match?.resync(client);
          break;
        case "ping":
          send(client, { t: "pong", n: msg.n });
          break;
      }
    });

    ws.on("close", () => {
      client.alive = false;
      const i = waiting.indexOf(client);
      if (i >= 0) waiting.splice(i, 1);
      client.draft?.onLeave(client);
      client.match?.onLeave(client);
    });
  });

  http.listen(port, () => {
    console.log(`[ricochet] serveur de match sur :${port}`);
  });

  return {
    http,
    close: () => {
      wss.close();
      http.close();
    },
  };
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("server/server.ts");
if (invokedDirectly) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  createMatchServer(port);
}
