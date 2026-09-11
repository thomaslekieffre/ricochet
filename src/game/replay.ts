/**
 * Replays (docs/PHASES.md P6). A finished match is a tiny JSON file — the setup
 * plus the order log — because `newMatch(setup)` + `resolve()` are deterministic,
 * so the whole match reconstructs byte for byte from a few hundred integers.
 */

import type { HeroKind, MatchConfig, Order } from "../engine/index";

export const REPLAY_VERSION = 1;

export interface RecordedMatch {
  v: number;
  createdAt: string;
  setup: {
    teamA: HeroKind[];
    teamB: HeroKind[];
    arenaId: string;
    config?: Partial<MatchConfig>;
  };
  log: [Order, Order][];
  winner: 0 | 1 | null;
}

export function makeRecording(
  setup: RecordedMatch["setup"],
  log: [Order, Order][],
  winner: 0 | 1 | null,
): RecordedMatch {
  return { v: REPLAY_VERSION, createdAt: new Date().toISOString(), setup, log, winner };
}

export function downloadRecording(rec: RecordedMatch): void {
  const blob = new Blob([JSON.stringify(rec)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ricochet-${rec.createdAt.replace(/[:.]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function parseRecording(json: string): RecordedMatch {
  const rec = JSON.parse(json) as RecordedMatch;
  if (rec.v !== REPLAY_VERSION) throw new Error(`version de replay non gérée : ${rec.v}`);
  if (!Array.isArray(rec.log) || !rec.setup?.teamA) throw new Error("replay invalide");
  return rec;
}
