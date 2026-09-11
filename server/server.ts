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
import { DEFAULT_RATING, toDisplay } from "../src/lib/glicko2";
import {
  DEFAULT_PORT,
  PROTOCOL_VERSION,
  encode,
  type ClientMsg,
  type LiveMatchInfo,
  type QueueSetup,
  type ServerMsg,
} from "../src/net/protocol";

const TURN_DEADLINE_MS = 12_000;
const ANIM_GRACE_MS = 9_000;
const DRAFT_BAN_MS = 15_000;
const DRAFT_PICK_MS = 25_000;

const HOLD: Order = { bodyId: -1, angleIdx: 0, power: 0, ability: false, hold: true };

// Matchmaking par note (docs/PHASES.md P5) : fenêtre d'acceptation qui s'élargit
// avec l'attente, en points de note affichée (échelle 1500 ± 173.7·mu).
const RANK_WINDOW_BASE = 60;
const RANK_WINDOW_PER_SEC = 12;
/** Au-delà de cette attente sans adversaire de note proche, on retombe en file classique (non classé). */
const RANKED_FALLBACK_MS = 45_000;
const DEFAULT_DISPLAY_RATING = toDisplay(DEFAULT_RATING).rating; // 1500

// PocketBase (docs/PHASES.md P4) : optionnel — absent en dev sans backend branché,
// les matchs ne sont juste pas persistés (aucun crash, `settleMatch` devient un no-op).
const POCKETBASE_URL = process.env.POCKETBASE_URL || "";
const MATCH_SETTLE_SECRET = process.env.MATCH_SETTLE_SECRET || "";

/** Vérifie le JWT PocketBase envoyé par le client et renvoie l'id utilisateur, ou `null`. */
async function verifyToken(token: string | undefined): Promise<string | null> {
  if (!token || !POCKETBASE_URL) return null;
  try {
    const res = await fetch(`${POCKETBASE_URL}/api/collections/users/auth-refresh`, {
      method: "POST",
      headers: { Authorization: token },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { record?: { id?: string } };
    return body.record?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Note affichée (échelle Glicko-2 1500 ± 173.7·mu) d'un compte, pour le
 * matchmaking par fenêtre (P5). `ratings` est en lecture publique côté
 * PocketBase — pas besoin du JWT du joueur. Pas de ligne == jamais classé
 * encore == note de départ (1500), comme `ratingOrDefault` côté
 * `settle-match.pb.js`.
 */
async function fetchRating(userId: string): Promise<number> {
  if (!POCKETBASE_URL) return DEFAULT_DISPLAY_RATING;
  try {
    const filter = encodeURIComponent(`user='${userId}'`);
    const res = await fetch(
      `${POCKETBASE_URL}/api/collections/ratings/records?filter=${filter}&perPage=1`,
    );
    if (!res.ok) return DEFAULT_DISPLAY_RATING;
    const body = (await res.json()) as { items?: Array<{ mu?: number; phi?: number }> };
    const rec = body.items?.[0];
    if (!rec) return DEFAULT_DISPLAY_RATING;
    return toDisplay({
      mu: rec.mu ?? DEFAULT_RATING.mu,
      phi: rec.phi ?? DEFAULT_RATING.phi,
      sigma: 0,
    }).rating;
  } catch {
    return DEFAULT_DISPLAY_RATING;
  }
}

interface SettleParams {
  mode: "ranked" | "unranked";
  arenaId: string;
  seat0: string | null;
  seat1: string | null;
  team0: HeroKind[];
  team1: HeroKind[];
  winner: 0 | 1 | null;
  hold0: number;
  hold1: number;
  turns: number;
  orderLog: [Order, Order][];
}

/** `POST /api/settle-match` (pocketbase/pb_hooks/settle-match.pb.js) — best-effort, jamais bloquant. */
async function settleMatch(p: SettleParams): Promise<void> {
  if (!POCKETBASE_URL) return;
  try {
    const res = await fetch(`${POCKETBASE_URL}/api/settle-match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(MATCH_SETTLE_SECRET ? { "X-Settle-Secret": MATCH_SETTLE_SECRET } : {}),
      },
      body: JSON.stringify({
        mode: p.mode, // "ranked" si les deux sièges viennent du matchmaking par note (P5)
        arena: p.arenaId,
        seat0: p.seat0,
        seat1: p.seat1,
        team0: p.team0,
        team1: p.team1,
        winner: p.winner,
        hold0: p.hold0,
        hold1: p.hold1,
        turns: p.turns,
        orderLog: p.orderLog,
      }),
    });
    if (!res.ok) {
      console.error(`[ricochet] settle-match a échoué (${res.status})`, await res.text());
    }
  } catch (err) {
    console.error("[ricochet] settle-match injoignable", err);
  }
}

let nextId = 1;

/** Matchs en cours, pour le spectate (docs/PHASES.md P6) : `matchId -> Match`. */
const liveMatches = new Map<string, Match>();

interface Client {
  id: number;
  ws: WebSocket;
  setup: QueueSetup | null;
  draft: Draft | null;
  match: Match | null;
  spectating: Match | null;
  seat: 0 | 1;
  alive: boolean;
  /** Id utilisateur PocketBase si `QueueSetup.token` a été vérifié avec succès (P4), sinon invité. */
  userId: string | null;
  /** Horodatage de mise en file — fait grandir la fenêtre d'acceptation (P5). */
  queuedAt: number;
  /**
   * Note affichée courante, une fois `userId` vérifié et la note récupérée
   * (P5). `null` tant que c'est en cours, ou pour un invité — jamais éligible
   * au matchmaking classé.
   */
  ratingDisplay: number | null;
  /**
   * `false` tant que la vérification du token (`verifyToken` + `fetchRating`)
   * n'est pas retombée pour CE client. Distinct de `ratingDisplay === null` :
   * un compte dont le token est encore en vol a aussi `ratingDisplay: null`
   * le temps du fetch, mais n'est pas un invité — `matchFifoFallback` doit
   * attendre `verified` avant de le traiter comme tel, sinon un match entre
   * deux comptes classés connectés à quelques ms d'écart peut basculer en
   * non classé par pure course (bug trouvé en vérifiant P5 en vrai).
   */
  verified: boolean;
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
  private observers = new Set<Client>();
  private timer: NodeJS.Timeout | null = null;
  private closed = false;
  /** Tous les ordres joués, tour par tour — envoyé à `settle-match` pour rejeu (P4). */
  private orderLog: [Order, Order][] = [];

  constructor(
    readonly id: string,
    private seats: [Client, Client],
    private teamA: HeroKind[],
    private teamB: HeroKind[],
    arenaId: string,
    private mode: "ranked" | "unranked" = "unranked",
  ) {
    const [a, b] = seats;
    a.match = this;
    b.match = this;
    this.state = newMatch({
      teamA: teamA as [HeroKind, HeroKind, HeroKind],
      teamB: teamB as [HeroKind, HeroKind, HeroKind],
      arena: arenaId,
    });
    liveMatches.set(this.id, this);
    this.beginTurn(true);
  }

  get arenaId(): string {
    return this.state.arena.id;
  }

  addObserver(c: Client): void {
    if (this.closed) return;
    this.observers.add(c);
    c.spectating = this;
    send(c, { t: "spectating", matchId: this.id, state: this.state });
  }

  removeObserver(c: Client): void {
    this.observers.delete(c);
    if (c.spectating === this) c.spectating = null;
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
    this.orderLog.push([a, b]);
    const deadlineMs = Date.now() + ANIM_GRACE_MS + TURN_DEADLINE_MS;
    const hash = hashState(this.state);
    for (const c of [...this.seats, ...this.observers]) {
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
      for (const c of this.observers) {
        send(c, { t: "spectateEnded", matchId: this.id, winner: this.state.winner });
      }
      this.settle(this.state.winner);
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
      for (const o of this.observers) {
        send(o, { t: "spectateEnded", matchId: this.id, winner: other.seat });
      }
      this.settle(other.seat); // forfait — l'adversaire présent gagne
    }
    this.close();
  }

  /** Persiste le match terminé via `settle-match` (P4) — best-effort, ne bloque jamais la partie. */
  private settle(winner: 0 | 1 | null): void {
    // classé seulement si les deux sièges sont des comptes identifiés — un
    // forfait/déco avant vérification du token (ou un invité côté matchmaking
    // par note qui n'aurait jamais dû arriver ici) retombe en non classé.
    const mode: "ranked" | "unranked" =
      this.mode === "ranked" && this.seats[0].userId && this.seats[1].userId
        ? "ranked"
        : "unranked";
    void settleMatch({
      mode,
      arenaId: this.arenaId,
      seat0: this.seats[0].userId,
      seat1: this.seats[1].userId,
      team0: this.teamA,
      team1: this.teamB,
      winner,
      hold0: this.state.hold[0],
      hold1: this.state.hold[1],
      turns: this.state.turn,
      orderLog: this.orderLog,
    });
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
    liveMatches.delete(this.id);
    for (const c of this.seats) c.match = null;
    for (const c of this.observers) c.spectating = null;
    this.observers.clear();
  }
}

export function createMatchServer(port = DEFAULT_PORT): { http: Server; close: () => void } {
  const waiting: Client[] = [];

  const http = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, waiting: waiting.length, matches: liveMatches.size }));
      return;
    }
    res.writeHead(426);
    res.end("upgrade required");
  });

  const wss = new WebSocketServer({ server: http });

  const removeFromWaiting = (c: Client): void => {
    const i = waiting.indexOf(c);
    if (i >= 0) waiting.splice(i, 1);
  };

  const startMatch = (a: Client, b: Client, mode: "ranked" | "unranked"): void => {
    const id = `m${nextId++}`;
    a.seat = 0;
    b.seat = 1;
    send(a, { t: "paired", matchId: id, seat: 0 });
    send(b, { t: "paired", matchId: id, seat: 1 });
    // seat 0 picks the arena, comme avant l'introduction du draft
    new Draft(id, [a, b], a.setup!.arenaId, (teamA, teamB, arenaId) => {
      new Match(id, [a, b], teamA, teamB, arenaId, mode);
    });
  };

  /**
   * File ordonnée par note (P5) : le compte qui attend depuis le plus
   * longtemps entraîne la plus large fenêtre (`±(60 + 12·s)` en points de
   * note affichée), on cherche l'adversaire classé dispo le plus proche à
   * l'intérieur. Deux invités (ou n'importe qui après `RANKED_FALLBACK_MS`
   * sans adversaire classé proche) tombent dans la file non classée FIFO
   * inchangée — jouer sans compte reste toujours immédiat.
   */
  const matchRanked = (): void => {
    const rated = waiting
      .filter((c) => c.alive && c.ratingDisplay !== null)
      .sort((x, y) => x.queuedAt - y.queuedAt);
    const used = new Set<Client>();
    for (const a of rated) {
      if (used.has(a)) continue;
      const waitS = (Date.now() - a.queuedAt) / 1000;
      const window = RANK_WINDOW_BASE + RANK_WINDOW_PER_SEC * waitS;
      let best: Client | null = null;
      let bestDiff = Infinity;
      for (const b of rated) {
        if (b === a || used.has(b)) continue;
        const diff = Math.abs(a.ratingDisplay! - b.ratingDisplay!);
        if (diff <= window && diff < bestDiff) {
          best = b;
          bestDiff = diff;
        }
      }
      if (best) {
        used.add(a);
        used.add(best);
      }
    }
    for (const c of used) removeFromWaiting(c);
    // apparie les paires trouvées (après avoir purgé `waiting`, `used` par paires successives dans l'ordre où elles ont été formées)
    const pairs: Client[] = [...used];
    for (let i = 0; i < pairs.length; i += 2) {
      startMatch(pairs[i]!, pairs[i + 1]!, "ranked");
    }
  };

  const pairAndRemove = (idxA: number, idxB: number, mode: "ranked" | "unranked"): void => {
    const a = waiting[idxA]!;
    const b = waiting[idxB]!;
    waiting.splice(Math.max(idxA, idxB), 1);
    waiting.splice(Math.min(idxA, idxB), 1);
    startMatch(a, b, mode);
  };

  /**
   * Non classé : jouer sans compte reste toujours immédiat — un invité
   * absorbe le premier venu (classé ou non) plutôt que d'attendre derrière la
   * file par note. Une fois les invités épuisés, seuls des comptes classés
   * restent : ils ne tombent en non classé entre eux qu'après
   * `RANKED_FALLBACK_MS` sans adversaire de note proche.
   */
  const matchFifoFallback = (): void => {
    for (;;) {
      if (waiting.length < 2) return;
      const guestIdx = waiting.findIndex((c) => c.alive && c.verified && c.ratingDisplay === null);
      if (guestIdx >= 0) {
        const otherIdx = waiting.findIndex((c, i) => i !== guestIdx && c.alive);
        if (otherIdx < 0) return;
        pairAndRemove(guestIdx, otherIdx, "unranked");
        continue;
      }
      const expired = (c: Client): boolean => Date.now() - c.queuedAt > RANKED_FALLBACK_MS;
      const idxA = waiting.findIndex((c) => c.alive && expired(c));
      if (idxA < 0) return;
      const idxB = waiting.findIndex((c, i) => i !== idxA && c.alive && expired(c));
      if (idxB < 0) return;
      pairAndRemove(idxA, idxB, "unranked");
    }
  };

  const tryMatch = (): void => {
    for (let i = waiting.length - 1; i >= 0; i--) {
      if (!waiting[i]!.alive) waiting.splice(i, 1);
    }
    matchRanked();
    matchFifoFallback();
  };

  // la fenêtre de note grandit avec le temps : re-tente même sans nouvel événement.
  const rankedTicker = setInterval(tryMatch, 2000);

  wss.on("connection", (ws: WebSocket) => {
    const client: Client = {
      id: nextId++,
      ws,
      setup: null,
      draft: null,
      match: null,
      spectating: null,
      seat: 0,
      alive: true,
      userId: null,
      queuedAt: 0,
      ratingDisplay: null,
      verified: false,
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
          client.queuedAt = Date.now();
          client.ratingDisplay = null;
          client.verified = false;
          if (!waiting.includes(client)) waiting.push(client);
          send(client, { t: "queued" });
          void verifyToken(msg.setup.token).then(async (userId) => {
            client.userId = userId;
            client.ratingDisplay = userId ? await fetchRating(userId) : null;
            client.verified = true;
            tryMatch();
          });
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
        case "listMatches": {
          const matches: LiveMatchInfo[] = [...liveMatches.values()].map((m) => ({
            matchId: m.id,
            arenaId: m.arenaId,
            turn: m.state.turn,
          }));
          send(client, { t: "matchList", matches });
          break;
        }
        case "spectate": {
          const m = liveMatches.get(msg.matchId);
          if (m) m.addObserver(client);
          break;
        }
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
      client.spectating?.removeObserver(client);
    });
  });

  http.listen(port, () => {
    console.log(`[ricochet] serveur de match sur :${port}`);
  });

  return {
    http,
    close: () => {
      clearInterval(rankedTicker);
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
