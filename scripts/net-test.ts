/**
 * Phase 3 integration test. Boots the authoritative server, connects two Node
 * WebSocket clients, plays scripted turns, and checks that:
 *   - both clients receive the same authoritative hash every turn;
 *   - re-running the shared resolver on the same (prevState, orderA, orderB)
 *     reproduces that hash — client and server engine agree, byte for byte.
 *
 * Run: npx tsx scripts/net-test.ts
 */

import { WebSocket } from "ws";
import { hashState, resolve } from "../src/engine/index";
import { fromFloat, toFloat } from "../src/engine/fixed";
import { angleToIdx } from "../src/engine/trig";
import type { GameState, HeroKind, Order } from "../src/engine/index";
import { createMatchServer } from "../server/server";
import { encode } from "../src/net/protocol";
import type { ClientMsg, ServerMsg } from "../src/net/protocol";

const PORT = 8799;
const MAX_TURNS = 30;

function towardZone(s: GameState, seat: 0 | 1): Order {
  const body = s.bodies.find((b) => b.owner === seat && b.alive);
  if (!body) return { bodyId: -1, angleIdx: 0, power: 0, ability: false, hold: true };
  const dx = toFloat(s.arena.zone.x - body.x);
  const dy = toFloat(s.arena.zone.y - body.y);
  const dist = Math.hypot(dx, dy);
  return {
    bodyId: body.id,
    angleIdx: angleToIdx(Math.atan2(dy, dx)),
    power: fromFloat(Math.min(dist / 1400, 0.3)),
    ability: false,
  };
}

interface Seat {
  ws: WebSocket;
  seat: 0 | 1;
  matchId: string;
  state: GameState;
}

let failed = 0;
const ok = (name: string, cond: boolean) => {
  console.log(`${cond ? "  ok  " : " FAIL "} ${name}`);
  if (!cond) failed++;
};

async function main(): Promise<void> {
  const server = createMatchServer(PORT);
  await new Promise((r) => setTimeout(r, 150));

  const seats: (Seat | null)[] = [null, null];
  const send = (ws: WebSocket, m: ClientMsg) => ws.send(encode(m));

  let turnsSeen = 0;
  let prevState: GameState | null = null;
  let lastOrders: [Order, Order] | null = null;
  const hashes: Record<number, string[]> = {};
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    for (const s of seats) s?.ws.close();
    server.close();
    let hashesMatch = true;
    for (const k of Object.keys(hashes)) {
      const [a, b] = hashes[Number(k)]!;
      if (a !== b) hashesMatch = false;
    }
    ok("les deux clients ont matché et joué", turnsSeen > 3);
    ok("hash serveur identique pour les deux clients à chaque tour", hashesMatch);
    console.log(failed === 0 ? "\nALL GREEN\n" : `\n${failed} FAILURE(S)\n`);
    process.exit(failed === 0 ? 0 : 1);
  };

  const playTurn = () => {
    const s0 = seats[0]!;
    const s1 = seats[1]!;
    if (s0.state.turn >= MAX_TURNS || s0.state.over) {
      finish();
      return;
    }
    prevState = s0.state;
    const oa = towardZone(s0.state, 0);
    const ob = towardZone(s1.state, 1);
    lastOrders = [oa, ob];
    send(s0.ws, { t: "order", matchId: s0.matchId, turn: s0.state.turn, order: oa });
    send(s1.ws, { t: "order", matchId: s1.matchId, turn: s1.state.turn, order: ob });
  };

  const onMsg = (idx: 0 | 1, m: ServerMsg) => {
    const seat = seats[idx];
    if (m.t === "paired") {
      seats[idx] = { ws: seat!.ws, seat: m.seat, matchId: m.matchId, state: seat!.state };
    } else if (m.t === "draft" && seat) {
      // client factice : bannit le premier héros du pool, prend les 3 premiers restants
      if (m.phase === "ban") {
        send(seat.ws, { t: "ban", matchId: seat.matchId, hero: m.pool[0]! });
      } else {
        const team = m.pool.slice(0, 3) as [HeroKind, HeroKind, HeroKind];
        send(seat.ws, { t: "pick", matchId: seat.matchId, team });
      }
    } else if (m.t === "matched") {
      seats[idx] = { ws: seat!.ws, seat: m.seat, matchId: m.matchId, state: m.state };
      if (seats[0]?.state && seats[1]?.state) playTurn();
    } else if (m.t === "turn" && seat) {
      seat.state = m.state;
      (hashes[m.turn] ??= []).push(m.hash);

      if (idx === 0 && prevState && lastOrders) {
        const local = resolve(prevState, lastOrders[0], lastOrders[1]);
        ok(
          `tour ${m.turn} : resolveur local == hash serveur`,
          hashState(local.state) === m.hash,
        );
        turnsSeen++;
      }
      send(seat.ws, { t: "ready", matchId: seat.matchId, turn: m.turn });
    } else if (m.t === "state" && seat) {
      seat.state = m.state;
      if (idx === 0) playTurn();
    } else if (m.t === "over") {
      finish();
    }
  };

  for (const idx of [0, 1] as const) {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    seats[idx] = { ws, seat: idx, matchId: "", state: null as unknown as GameState };
    ws.on("open", () => {
      send(ws, { t: "hello", v: 1 });
      send(ws, { t: "queue", setup: { arenaId: "carrefour" } });
    });
    ws.on("message", (raw: Buffer) => onMsg(idx, JSON.parse(raw.toString()) as ServerMsg));
  }

  setTimeout(() => {
    ok("le test se termine dans les temps", done);
    if (!done) finish();
  }, 15_000);
}

void main();
