/**
 * Classement classé réel (docs/PHASES.md P5) : lecture directe de PocketBase
 * en `fetch` brut (même choix que `session.ts` — pas de SDK), sur les
 * collections `seasons`/`season_ratings` déjà écrites par `settle-match`.
 * Distinct de `src/lib/profile.ts` (`ratingView`) qui simule une note en
 * local pour le profil hors ligne — ici c'est la vraie note serveur.
 */

import { toDisplay, tierOf } from "../lib/glicko2";
import type { Rating } from "../lib/glicko2";
import { TIER_LABEL } from "../lib/profile";
import { pocketbaseUrl } from "./session";

export interface RankRow {
  userId: string;
  name: string;
  rating: number;
  rd: number;
  tierLabel: string;
  games: number;
  /** `placement_left` retombé à 0 — hors de la phase de placement classé. */
  placed: boolean;
}

export interface SeasonInfo {
  id: string;
  name: string;
}

export class LeaderboardError extends Error {}

async function pbGet<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${pocketbaseUrl()}${path}`);
  } catch {
    throw new LeaderboardError("Serveur de comptes injoignable — réessaie plus tard.");
  }
  if (!res.ok) throw new LeaderboardError(`Erreur serveur (${res.status}).`);
  return res.json() as Promise<T>;
}

function toRow(r: Record<string, unknown>, name: string): RankRow {
  const rating: Rating = { mu: Number(r.mu ?? 0), phi: Number(r.phi), sigma: Number(r.sigma) };
  const d = toDisplay(rating);
  return {
    userId: String(r.user),
    name,
    rating: Math.round(d.rating),
    rd: Math.round(d.rd),
    tierLabel: TIER_LABEL[tierOf(d.rating)],
    games: Number(r.games ?? 0),
    placed: Number(r.placement_left ?? 0) <= 0,
  };
}

export const Leaderboard = {
  /** Saison courante, `null` si aucune n'est active (pas encore seedée en prod). */
  async activeSeason(): Promise<SeasonInfo | null> {
    const data = await pbGet<{ items: { id: string; name: string }[] }>(
      `/api/collections/seasons/records?filter=${encodeURIComponent("active=true")}&perPage=1`,
    );
    const s = data.items[0];
    return s ? { id: s.id, name: s.name } : null;
  },

  /** Note de l'utilisateur courant pour cette saison, `null` s'il n'a jamais joué classé. */
  async myRating(seasonId: string, userId: string, name: string): Promise<RankRow | null> {
    const data = await pbGet<{ items: Record<string, unknown>[] }>(
      `/api/collections/season_ratings/records?filter=${encodeURIComponent(
        `season="${seasonId}" && user="${userId}"`,
      )}&perPage=1`,
    );
    const r = data.items[0];
    return r ? toRow(r, name) : null;
  },

  /** Top classement de la saison, trié par note décroissante. */
  async top(seasonId: string, limit = 500): Promise<RankRow[]> {
    const data = await pbGet<{ items: (Record<string, unknown> & { expand?: { user?: { name?: string } } })[] }>(
      `/api/collections/season_ratings/records?filter=${encodeURIComponent(
        `season="${seasonId}"`,
      )}&sort=-mu&perPage=${limit}&expand=user`,
    );
    return data.items.map((r) => toRow(r, r.expand?.user?.name ?? "?"));
  },
};
