/**
 * Profil joueur local (docs/PHASES.md P4/P5, version sans PocketBase).
 *
 * Une seule identité stockée dans le navigateur (`localStorage`) : pseudo, XP de
 * compte, historique des matchs, et une note cachée Glicko-2 qui ne bouge que sur
 * les parties « classables » (pour l'instant : contre le bot, qui sert d'ancre de
 * niveau fixe). Aucune dépendance réseau. Le jour où l'on branche PocketBase, ce
 * module devient le cache local d'un profil serveur.
 */

import {
  DEFAULT_RATING,
  fromDisplay,
  settle1v1,
  tierOf,
  tierRange,
  toDisplay,
} from "./glicko2";
import type { Rating, Tier } from "./glicko2";
import type { HeroKind } from "../engine/types";

const KEY = "ricochet.profile.v1";
const HISTORY_CAP = 40;
/** Nombre de parties classables avant d'afficher un palier plutôt que « non classé ». */
export const PLACEMENT_GAMES = 5;

export interface MatchRecord {
  at: number;
  mode: "bot" | "hotseat";
  botLevel?: 1 | 2 | 3;
  arena: string;
  team: HeroKind[];
  opp: HeroKind[];
  won: boolean;
  turns: number;
  hold: [number, number];
  xpGained: number;
  ratingBefore: number | null;
  ratingAfter: number | null;
}

export interface Profile {
  v: 1;
  name: string;
  createdAt: number;
  xp: number;
  games: number;
  wins: number;
  losses: number;
  /** > 0 : série de victoires ; < 0 : série de défaites. */
  streak: number;
  /** note cachée (MMR) — ne bouge que sur les parties classables. */
  rating: Rating;
  /** nombre de parties qui ont fait bouger `rating`. */
  ranked: number;
  history: MatchRecord[];
}

// ---- stockage (avec une couture pour les tests) -------------------------------

export interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const memStore = (): Store => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v);
    },
    removeItem: (k) => {
      m.delete(k);
    },
  };
};

let store: Store =
  typeof localStorage !== "undefined" ? localStorage : memStore();

/** Remplace le magasin (utilisé par les tests). */
export function setStore(s: Store): void {
  store = s;
}

// ---- cycle de vie -----------------------------------------------------------

export function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 16);
}

export function isNameValid(raw: string): boolean {
  const n = sanitizeName(raw);
  return n.length >= 3 && n.length <= 16;
}

export function freshProfile(name: string): Profile {
  return {
    v: 1,
    name: sanitizeName(name) || "Joueur",
    createdAt: Date.now(),
    xp: 0,
    games: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    rating: { ...DEFAULT_RATING },
    ranked: 0,
    history: [],
  };
}

export function loadProfile(): Profile | null {
  const raw = store.getItem(KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Profile>;
    if (p && p.v === 1 && typeof p.name === "string") return normalize(p);
  } catch {
    /* entrée corrompue — traitée comme absente */
  }
  return null;
}

function normalize(p: Partial<Profile>): Profile {
  const base = freshProfile(p.name ?? "Joueur");
  return {
    ...base,
    ...p,
    v: 1,
    name: sanitizeName(p.name ?? base.name) || base.name,
    rating: p.rating ?? { ...DEFAULT_RATING },
    history: Array.isArray(p.history) ? p.history.slice(0, HISTORY_CAP) : [],
  };
}

export function saveProfile(p: Profile): void {
  store.setItem(KEY, JSON.stringify(p));
}

export function clearProfile(): void {
  store.removeItem(KEY);
}

export function renameProfile(p: Profile, name: string): Profile {
  const next = { ...p, name: sanitizeName(name) || p.name };
  saveProfile(next);
  return next;
}

// ---- niveau de compte -----------------------------------------------------

/**
 * Courbe d'XP : passer au niveau `n` coûte `100·(n-1)` d'XP, soit `50·L·(L-1)`
 * cumulés pour atteindre le niveau `L`. Douce au début, puis s'étire.
 */
export function levelFromXp(xp: number): {
  level: number;
  into: number;
  span: number;
} {
  const safe = Math.max(0, Math.floor(xp));
  let level = 1;
  let acc = 0;
  let need = 100;
  while (safe >= acc + need) {
    acc += need;
    level += 1;
    need = 100 * level;
  }
  return { level, into: safe - acc, span: need };
}

// ---- application d'un résultat ------------------------------------------

// Le bot est une ancre de note fixe, par niveau.
const BOT_RATING: Record<1 | 2 | 3, Rating> = {
  1: fromDisplay(1150, 90),
  2: fromDisplay(1500, 80),
  3: fromDisplay(1850, 90),
};

export interface Outcome {
  mode: "bot" | "hotseat";
  botLevel?: 1 | 2 | 3;
  arena: string;
  team: HeroKind[];
  opp: HeroKind[];
  won: boolean;
  turns: number;
  hold: [number, number];
}

export interface Applied {
  profile: Profile;
  record: MatchRecord;
  xpGained: number;
  ratingDelta: number | null;
  leveledTo: number | null;
}

/** Calcule le nouveau profil après une partie. Ne persiste pas — c'est à l'appelant. */
export function applyOutcome(p0: Profile, o: Outcome): Applied {
  const p: Profile = { ...p0, rating: { ...p0.rating }, history: p0.history.slice() };
  const levelBefore = levelFromXp(p.xp).level;

  let xpGained: number;
  let ratingBefore: number | null = null;
  let ratingAfter: number | null = null;
  let ratingDelta: number | null = null;

  if (o.mode === "bot" && o.botLevel) {
    const anchor = BOT_RATING[o.botLevel];
    ratingBefore = Math.round(toDisplay(p.rating).rating);
    const [next] = settle1v1(p.rating, anchor, o.won ? 0 : 1);
    p.rating = next;
    ratingAfter = Math.round(toDisplay(p.rating).rating);
    ratingDelta = ratingAfter - ratingBefore;
    p.ranked += 1;
    xpGained = o.won ? 90 + o.botLevel * 25 : 35;
  } else {
    xpGained = o.won ? 55 : 30;
  }

  p.games += 1;
  if (o.won) {
    p.wins += 1;
    p.streak = p.streak >= 0 ? p.streak + 1 : 1;
  } else {
    p.losses += 1;
    p.streak = p.streak <= 0 ? p.streak - 1 : -1;
  }
  if (o.won && p.streak >= 3) xpGained += 20; // prime de série
  p.xp += xpGained;

  const record: MatchRecord = {
    at: Date.now(),
    mode: o.mode,
    botLevel: o.botLevel,
    arena: o.arena,
    team: o.team.slice(),
    opp: o.opp.slice(),
    won: o.won,
    turns: o.turns,
    hold: [o.hold[0], o.hold[1]],
    xpGained,
    ratingBefore,
    ratingAfter,
  };
  p.history = [record, ...p.history].slice(0, HISTORY_CAP);

  const levelAfter = levelFromXp(p.xp).level;
  return {
    profile: p,
    record,
    xpGained,
    ratingDelta,
    leveledTo: levelAfter > levelBefore ? levelAfter : null,
  };
}

// ---- affichage de la note ------------------------------------------------

export const TIER_LABEL: Record<Tier, string> = {
  bronze: "Bronze",
  argent: "Argent",
  or: "Or",
  platine: "Platine",
  diamant: "Diamant",
  master: "Master",
  elite: "Élite",
};

/** Palier suivant par note ; `null` pour master (au-dessus, seul le leaderboard décide de l'Élite). */
const NEXT_TIER: Record<Tier, Tier | null> = {
  bronze: "argent",
  argent: "or",
  or: "platine",
  platine: "diamant",
  diamant: "master",
  master: null,
  elite: null,
};

export function ratingView(p: Profile): {
  rating: number;
  rd: number;
  tier: Tier;
  tierLabel: string;
  placed: boolean;
  placementLeft: number;
  /** Progression dans le palier courant, 0..1 ; 1 si pas de plafond (master). */
  tierProgress: number;
  /** Points de note restants avant le palier suivant ; `null` pour master (pas de palier au-dessus par note). */
  tierPointsToNext: number | null;
  nextTierLabel: string | null;
} {
  const d = toDisplay(p.rating);
  const placed = p.ranked >= PLACEMENT_GAMES;
  const tier = tierOf(d.rating);
  const { floor, ceiling } = tierRange(d.rating);
  const nextTier = NEXT_TIER[tier];
  return {
    rating: Math.round(d.rating),
    rd: Math.round(d.rd),
    tier,
    tierLabel: TIER_LABEL[tier],
    placed,
    placementLeft: Math.max(0, PLACEMENT_GAMES - p.ranked),
    tierProgress: ceiling === null ? 1 : Math.max(0, Math.min(1, (d.rating - floor) / (ceiling - floor))),
    tierPointsToNext: ceiling === null ? null : Math.max(0, Math.round(ceiling - d.rating)),
    nextTierLabel: nextTier ? TIER_LABEL[nextTier] : null,
  };
}

export function winrate(p: Profile): number {
  return p.games === 0 ? 0 : Math.round((p.wins / p.games) * 100);
}
