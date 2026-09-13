/**
 * Cosmétiques du pass de saison (docs/PHASES.md P7) : lecture PocketBase en
 * `fetch` brut, même pattern que `session.ts`/`leaderboard.ts`. Le catalogue
 * (`cosmetics`) est public ; la possession (`ownership`) est privée à
 * l'utilisateur connecté (`listRule: "@request.auth.id = user"`), d'où le
 * token requis pour ce second appel.
 */

import { pocketbaseUrl } from "./session";

export interface Cosmetic {
  id: string;
  slug: string;
  kind: "hero_skin" | "arena_skin" | "border" | "title";
  name: string;
  rarity: "common" | "rare" | "epic" | "seasonal";
  source: "battlepass_free" | "battlepass_premium" | "rank_reward" | "shop";
  tier: number;
}

export class CosmeticsError extends Error {}

async function pbGet<T>(path: string, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${pocketbaseUrl()}${path}`, token ? { headers: { Authorization: token } } : undefined);
  } catch {
    throw new CosmeticsError("Serveur de comptes injoignable — réessaie plus tard.");
  }
  if (!res.ok) throw new CosmeticsError(`Erreur serveur (${res.status}).`);
  return res.json() as Promise<T>;
}

export const Cosmetics = {
  /** Catalogue complet, trié par palier — public, ne nécessite pas de connexion. */
  async catalog(): Promise<Cosmetic[]> {
    const data = await pbGet<{ items: Cosmetic[] }>(`/api/collections/cosmetics/records?sort=tier&perPage=200`);
    return data.items;
  },

  /** Ids des cosmétiques possédés par l'utilisateur connecté. */
  async owned(userId: string, token: string): Promise<Set<string>> {
    const data = await pbGet<{ items: { cosmetic: string }[] }>(
      `/api/collections/ownership/records?filter=${encodeURIComponent(`user="${userId}"`)}&perPage=500`,
      token,
    );
    return new Set(data.items.map((o) => o.cosmetic));
  },
};
