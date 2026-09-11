/**
 * Glicko-2 (Mark Glickman). Used to settle ranked matches (docs/PHASES.md P5).
 *
 * Internal "Glicko-2 scale": `mu` is centred on 0, `phi` ≈ RD / 173.7178.
 * Display scale: rating = 1500 + 173.7178·mu, rd = 173.7178·phi.
 *
 * A ranked 1v1 is settled as a rating period containing a single game — that is
 * a valid, if noisier, use of the system.
 */

export const SCALE = 173.7178;
export const DEFAULT_TAU = 0.5;
export const MAX_RD = 350;

export interface Rating {
  mu: number; // Glicko-2 scale
  phi: number; // Glicko-2 scale
  sigma: number; // volatility
}

export interface Display {
  rating: number;
  rd: number;
}

export const DEFAULT_RATING: Rating = { mu: 0, phi: MAX_RD / SCALE, sigma: 0.06 };

export const toDisplay = (r: Rating): Display => ({
  rating: 1500 + SCALE * r.mu,
  rd: SCALE * r.phi,
});

export const fromDisplay = (rating: number, rd: number, sigma = 0.06): Rating => ({
  mu: (rating - 1500) / SCALE,
  phi: rd / SCALE,
  sigma,
});

const g = (phi: number): number => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));

const expectedScore = (mu: number, muJ: number, phiJ: number): number =>
  1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

export interface GameResult {
  opponent: Rating;
  score: number; // 1 win, 0.5 draw, 0 loss
}

/** One rating period. `games` may hold a single match. Returns the new Rating. */
export function update(
  player: Rating,
  games: GameResult[],
  tau = DEFAULT_TAU,
): Rating {
  if (games.length === 0) return decay(player);

  const { mu, phi, sigma } = player;

  // Step 3: estimated variance v
  let vInv = 0;
  for (const { opponent } of games) {
    const gj = g(opponent.phi);
    const e = expectedScore(mu, opponent.mu, opponent.phi);
    vInv += gj * gj * e * (1 - e);
  }
  const v = 1 / vInv;

  // Step 4: improvement Δ
  let deltaSum = 0;
  for (const { opponent, score } of games) {
    const e = expectedScore(mu, opponent.mu, opponent.phi);
    deltaSum += g(opponent.phi) * (score - e);
  }
  const delta = v * deltaSum;

  // Step 5: new volatility σ' via Illinois algorithm
  const a = Math.log(sigma * sigma);
  const phi2 = phi * phi;
  const delta2 = delta * delta;
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta2 - phi2 - v - ex);
    const den = 2 * (phi2 + v + ex) * (phi2 + v + ex);
    return num / den - (x - a) / (tau * tau);
  };

  let A = a;
  let B: number;
  if (delta2 > phi2 + v) {
    B = Math.log(delta2 - phi2 - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  const sigmaPrime = Math.exp(A / 2);

  // Step 6-7: new phi and mu
  const phiStar = Math.sqrt(phi2 + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;

  return { mu: muPrime, phi: Math.min(phiPrime, MAX_RD / SCALE), sigma: sigmaPrime };
}

/** A rating period with no games: uncertainty grows. */
export function decay(player: Rating): Rating {
  const phiStar = Math.sqrt(player.phi * player.phi + player.sigma * player.sigma);
  return { ...player, phi: Math.min(phiStar, MAX_RD / SCALE) };
}

/** Settle a single ranked 1v1. `winner` is the seat that won (0 | 1). */
export function settle1v1(
  a: Rating,
  b: Rating,
  winner: 0 | 1,
  tau = DEFAULT_TAU,
): [Rating, Rating] {
  const sa = winner === 0 ? 1 : 0;
  return [
    update(a, [{ opponent: b, score: sa }], tau),
    update(b, [{ opponent: a, score: 1 - sa }], tau),
  ];
}

export type Tier =
  | "bronze"
  | "argent"
  | "or"
  | "platine"
  | "diamant"
  | "master"
  | "elite";

/** Display rating → palier. `elite` (top 500) is decided by leaderboard rank, not here. */
export function tierOf(rating: number): Tier {
  if (rating < 900) return "bronze";
  if (rating < 1200) return "argent";
  if (rating < 1500) return "or";
  if (rating < 1800) return "platine";
  if (rating < 2100) return "diamant";
  return "master";
}

/** Soft reset between seasons: compress toward the mean, restore some uncertainty. */
export function softReset(r: Rating): Rating {
  return { mu: r.mu * 0.6, phi: Math.max(r.phi, 200 / SCALE), sigma: 0.06 };
}
