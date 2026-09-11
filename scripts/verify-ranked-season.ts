/**
 * Vérification ponctuelle P5 : un match classé de bout en bout met bien à
 * jour Glicko-2 (ratings + season_ratings) via une saison active réelle.
 * Pas un test automatisé permanent (pas dans `npm test`/`npm run check`) —
 * un script à lancer une fois contre une instance PocketBase locale avec
 * deux comptes existants, cf. docs/PHASES.md P5.
 *
 * Prérequis :
 *   - PocketBase local lancé (pocketbase/README.md), une saison active
 *     (POST /api/rollover-season)
 *   - deux comptes de test existants (email/mdp ci-dessous)
 *
 * Run: POCKETBASE_URL=http://127.0.0.1:8090 npx tsx scripts/verify-ranked-season.ts
 */

import { WebSocket } from "ws";
import { pickOrder } from "../src/engine/bot";
import type { GameState, HeroKind, Order } from "../src/engine/index";
import { createMatchServer } from "../server/server";
import { encode } from "../src/net/protocol";
import type { ClientMsg, ServerMsg } from "../src/net/protocol";

const PB_URL = process.env.POCKETBASE_URL || "http://127.0.0.1:8090";
const PORT = 8798;
const MAX_TURNS = 120; // filet de sécurité seulement — le vrai bot termine la partie de lui-même

const ACCOUNTS = [
  { email: "e2e-verify@example.com", password: "verify12345" },
  { email: "mm-test2@example.com", password: "verify12345" },
];

async function login(email: string, password: string): Promise<{ token: string; id: string }> {
  const res = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!res.ok) throw new Error(`login ${email} -> ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { token: string; record: { id: string } };
  return { token: body.token, id: body.record.id };
}

async function fetchRating(collection: string, filter: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${PB_URL}/api/collections/${collection}/records?filter=${encodeURIComponent(filter)}&perPage=1`);
  if (!res.ok) return null;
  const body = (await res.json()) as { items: Record<string, unknown>[] };
  return body.items[0] ?? null;
}

interface Seat {
  ws: WebSocket;
  seat: 0 | 1;
  matchId: string;
  state: GameState;
}

async function main(): Promise<void> {
  console.log(`PocketBase : ${PB_URL}`);
  const [accA, accB] = (await Promise.all(ACCOUNTS.map((a) => login(a.email, a.password)))) as [
    { token: string; id: string },
    { token: string; id: string },
  ];
  console.log(`connecté : ${ACCOUNTS[0]!.email} (${accA.id}), ${ACCOUNTS[1]!.email} (${accB.id})`);

  const beforeA = await fetchRating("ratings", `user = "${accA.id}"`);
  const beforeB = await fetchRating("ratings", `user = "${accB.id}"`);
  console.log("ratings avant :", { a: beforeA, b: beforeB });

  const server = createMatchServer(PORT);
  await new Promise((r) => setTimeout(r, 150));

  const seats: (Seat | null)[] = [null, null];
  const send = (ws: WebSocket, m: ClientMsg) => ws.send(encode(m));
  let done = false;
  let matchMode = "";

  const finish = async (): Promise<void> => {
    if (done) return;
    done = true;
    for (const s of seats) s?.ws.close();
    server.close();
    console.log(`\nmatch terminé, mode réglé côté serveur : ${matchMode || "(inconnu)"}`);
    // laisse le temps à settle-match (fetch async côté serveur) de retourner
    await new Promise((r) => setTimeout(r, 1500));
    const afterA = await fetchRating("ratings", `user = "${accA.id}"`);
    const afterB = await fetchRating("ratings", `user = "${accB.id}"`);
    console.log("ratings après :", { a: afterA, b: afterB });
    const seasonA = await fetchRating("season_ratings", `user = "${accA.id}"`);
    const seasonB = await fetchRating("season_ratings", `user = "${accB.id}"`);
    console.log("season_ratings après :", { a: seasonA, b: seasonB });

    const changed =
      JSON.stringify(beforeA) !== JSON.stringify(afterA) || JSON.stringify(beforeB) !== JSON.stringify(afterB);
    console.log(changed ? "\nOK — les notes ont bougé après le match classé\n" : "\nPAS DE CHANGEMENT — voir ci-dessus\n");
    process.exit(changed ? 0 : 1);
  };

  const playTurn = (): void => {
    const s0 = seats[0]!;
    const s1 = seats[1]!;
    if (s0.state.turn >= MAX_TURNS || s0.state.over) {
      void finish();
      return;
    }
    const oa = pickOrder(s0.state, 0, 2);
    const ob = pickOrder(s1.state, 1, 2);
    send(s0.ws, { t: "order", matchId: s0.matchId, turn: s0.state.turn, order: oa });
    send(s1.ws, { t: "order", matchId: s1.matchId, turn: s1.state.turn, order: ob });
  };

  const onMsg = (idx: 0 | 1, m: ServerMsg): void => {
    const seat = seats[idx];
    if (m.t === "paired") {
      seats[idx] = { ws: seat!.ws, seat: m.seat, matchId: m.matchId, state: seat!.state };
      matchMode = "paired (draft à suivre)";
    } else if (m.t === "draft" && seat) {
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
      send(seat.ws, { t: "ready", matchId: seat.matchId, turn: m.turn });
      if (idx === 0) console.log(`  tour ${m.turn} — hold ${seat.state.hold[0]}/${seat.state.hold[1]} (over=${seat.state.over})`);
    } else if (m.t === "state" && seat) {
      seat.state = m.state;
      if (idx === 0) playTurn();
    } else if (m.t === "over") {
      matchMode = "over reçu";
      void finish();
    }
  };

  const tokens = [accA.token, accB.token];
  for (const idx of [0, 1] as const) {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    seats[idx] = { ws, seat: idx, matchId: "", state: null as unknown as GameState };
    ws.on("open", () => {
      send(ws, { t: "hello", v: 1 });
      send(ws, { t: "queue", setup: { arenaId: "carrefour", token: tokens[idx] } });
    });
    ws.on("message", (raw: Buffer) => onMsg(idx, JSON.parse(raw.toString()) as ServerMsg));
  }

  setTimeout(() => {
    if (!done) {
      console.log("\nTIMEOUT — le match n'a pas fini à temps\n");
      void finish();
    }
  }, 30_000);
}

void main();
