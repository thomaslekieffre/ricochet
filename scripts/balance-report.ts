/**
 * Signal d'équilibrage objectif — pas un remplacement du "on règle le feel en
 * jouant" (CLAUDE.md), mais un repérage rapide des cas grossiers (héros qui
 * écrase tout, matchup à sens unique) avant de lancer des vraies parties.
 *
 * Round-robin d'équipes mono-héros (3x le même héros) sur les 3 arènes, avec
 * la vraie IA (`pickOrder`, niveau Correct) des deux côtés. Le moteur est
 * entièrement déterministe (CLAUDE.md) donc chaque matchup ne donne qu'UN
 * résultat — ce n'est PAS un échantillon statistique, juste un signal net
 * sur les cas extrêmes (victoires écrasantes, égalités suspectes).
 *
 * Run: npx tsx scripts/balance-report.ts
 */

import { newMatch, pickOrder, resolve, ROSTER } from "../src/engine/index";
import type { GameState, HeroKind } from "../src/engine/index";

// Le bot niveau 2/3 est bien trop cher à faire tourner en round-robin (~50
// resolve() internes par pickOrder — un seul matchup complet peut prendre
// 10-15s). Niveau 1 (moins de candidats évalués) donne un signal plus
// bruité mais praticable : ~4-5s/matchup. Une seule arène pour le même
// motif de coût — le signal cherché est le déséquilibre héros, pas
// l'interaction avec le décor.
const ARENAS = ["carrefour"];
const BOT_LEVEL = 1;
const MAX_TURNS = 70; // targetHold=15, maxTurns=60 + marge de mort subite

interface Result {
  a: HeroKind;
  b: HeroKind;
  arena: string;
  winner: 0 | 1 | null;
  hold: [number, number];
  turns: number;
}

function playOne(a: HeroKind, b: HeroKind, arena: string): Result {
  let s: GameState = newMatch({ teamA: [a, a, a], teamB: [b, b, b], arena });
  let turns = 0;
  while (!s.over && turns < MAX_TURNS) {
    const oa = pickOrder(s, 0, BOT_LEVEL);
    const ob = pickOrder(s, 1, BOT_LEVEL);
    s = resolve(s, oa, ob).state;
    turns++;
  }
  return { a, b, arena, winner: s.winner, hold: s.hold, turns };
}

const results: Result[] = [];
for (let i = 0; i < ROSTER.length; i++) {
  for (let j = i + 1; j < ROSTER.length; j++) {
    for (const arena of ARENAS) {
      results.push(playOne(ROSTER[i]!, ROSTER[j]!, arena));
    }
  }
}

const wins: Record<HeroKind, number> = Object.fromEntries(ROSTER.map((h) => [h, 0])) as Record<HeroKind, number>;
const games: Record<HeroKind, number> = Object.fromEntries(ROSTER.map((h) => [h, 0])) as Record<HeroKind, number>;
const marginSum: Record<HeroKind, number> = Object.fromEntries(ROSTER.map((h) => [h, 0])) as Record<HeroKind, number>;
let draws = 0;
let timeouts = 0;

for (const r of results) {
  games[r.a]++;
  games[r.b]++;
  if (r.winner === 0) {
    wins[r.a]++;
    marginSum[r.a] += r.hold[0] - r.hold[1];
    marginSum[r.b] -= r.hold[0] - r.hold[1];
  } else if (r.winner === 1) {
    wins[r.b]++;
    marginSum[r.b] += r.hold[1] - r.hold[0];
    marginSum[r.a] -= r.hold[1] - r.hold[0];
  } else {
    draws++;
  }
  if (r.turns >= MAX_TURNS) timeouts++;
}

console.log(`${results.length} matchups joués (${ROSTER.length} héros x 3 arènes, mono-équipe 3x le même héros)\n`);
console.log("héros       victoires  marge moyenne de hold");
const ranked = [...ROSTER].sort((x, y) => wins[y]! / games[y]! - wins[x]! / games[x]!);
for (const h of ranked) {
  const winRate = ((wins[h]! / games[h]!) * 100).toFixed(0);
  const avgMargin = (marginSum[h]! / games[h]!).toFixed(1);
  console.log(`${h.padEnd(12)} ${wins[h]}/${games[h]} (${winRate}%)   ${avgMargin}`);
}
console.log(`\négalités : ${draws}, matchs allés au bout des ${MAX_TURNS} tours : ${timeouts}`);

// détail des résultats les plus lopsidés (marge de hold > 10)
const lopsided = results
  .filter((r) => Math.abs(r.hold[0] - r.hold[1]) >= 10)
  .sort((x, y) => Math.abs(y.hold[0] - y.hold[1]) - Math.abs(x.hold[0] - x.hold[1]));
if (lopsided.length > 0) {
  console.log(`\nmatchups les plus écrasants (marge de hold >= 10) :`);
  for (const r of lopsided.slice(0, 15)) {
    console.log(`  ${r.a} vs ${r.b} sur ${r.arena} : ${r.hold[0]}-${r.hold[1]} en ${r.turns} tours`);
  }
}
