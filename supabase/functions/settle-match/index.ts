/**
 * Edge Function `settle-match` (docs/PHASES.md P4 + P5).
 *
 * Called by the match server (service role) when a match ends. It:
 *   1. inserts the `matches` row (rejouable via order_log),
 *   2. if ranked: recomputes Glicko-2 for both players and applies it atomically
 *      via the `settle_ranked_match` RPC, then grants battle-pass XP.
 *
 * The Glicko-2 maths below MUST stay in sync with src/lib/glicko2.ts (single
 * source of truth). Kept inline here so the function has no local imports.
 *
 * Deploy: supabase functions deploy settle-match --no-verify-jwt
 * Auth:   caller must present the service-role key in `Authorization`.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SCALE = 173.7178;
const MAX_PHI = 350 / SCALE;

interface R { mu: number; phi: number; sigma: number }
const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu: number, mj: number, pj: number) => 1 / (1 + Math.exp(-g(pj) * (mu - mj)));

function update(p: R, oppo: R, score: number, tau = 0.5): R {
  const v = 1 / (g(oppo.phi) ** 2 * E(p.mu, oppo.mu, oppo.phi) * (1 - E(p.mu, oppo.mu, oppo.phi)));
  const dSum = g(oppo.phi) * (score - E(p.mu, oppo.mu, oppo.phi));
  const delta = v * dSum;
  const a = Math.log(p.sigma ** 2);
  const p2 = p.phi ** 2;
  const f = (x: number) => {
    const ex = Math.exp(x);
    return (ex * (delta ** 2 - p2 - v - ex)) / (2 * (p2 + v + ex) ** 2) - (x - a) / (tau * tau);
  };
  let A = a;
  let B = delta ** 2 > p2 + v ? Math.log(delta ** 2 - p2 - v) : a - (() => { let k = 1; while (f(a - k * tau) < 0) k++; return k; })() * tau;
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const sigma = Math.exp(A / 2);
  const phiStar = Math.sqrt(p2 + sigma ** 2);
  const phi = Math.min(1 / Math.sqrt(1 / phiStar ** 2 + 1 / v), MAX_PHI);
  return { mu: p.mu + phi ** 2 * dSum, phi, sigma };
}

Deno.serve(async (req) => {
  const body = await req.json();
  const {
    mode, arena, seat0, seat1, team0, team1, winner, hold0, hold1, turns, order_log,
  } = body;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: season } = await supabase
    .from("seasons").select("id").eq("active", true).maybeSingle();
  const seasonId = season?.id ?? null;

  const { data: match, error: mErr } = await supabase.from("matches").insert({
    mode, season_id: mode === "ranked" ? seasonId : null, arena,
    seat0, seat1, team0, team1, winner, hold0, hold1, turns,
    order_log, ended_at: new Date().toISOString(),
  }).select("id").single();
  if (mErr) return new Response(JSON.stringify({ error: mErr.message }), { status: 500 });

  if (mode === "ranked" && seat0 && seat1 && seasonId) {
    const { data: rows } = await supabase
      .from("ratings").select("*").in("profile_id", [seat0, seat1]);
    const byId: Record<string, R & { profile_id: string }> = {};
    for (const r of rows ?? []) byId[r.profile_id] = r;
    const a = byId[seat0] ?? { profile_id: seat0, mu: 0, phi: MAX_PHI, sigma: 0.06 };
    const b = byId[seat1] ?? { profile_id: seat1, mu: 0, phi: MAX_PHI, sigma: 0.06 };
    const sa = winner === 0 ? 1 : 0;
    const na = update(a, b, sa);
    const nb = update(b, a, 1 - sa);
    await supabase.rpc("settle_ranked_match", {
      p_season: seasonId,
      p_a_profile: seat0, p_a_mu: na.mu, p_a_phi: na.phi, p_a_sigma: na.sigma,
      p_b_profile: seat1, p_b_mu: nb.mu, p_b_phi: nb.phi, p_b_sigma: nb.sigma,
    });
  }

  // battle-pass XP for both players (all modes)
  for (const pid of [seat0, seat1].filter(Boolean)) {
    if (seasonId) await supabase.rpc("grant_battlepass_xp", { p_season: seasonId, p_profile: pid, p_xp: 120 });
    await supabase.rpc("bump_account_xp", { p_profile: pid, p_xp: 80 }).catch(() => {});
  }

  return new Response(JSON.stringify({ ok: true, matchId: match.id }), {
    headers: { "content-type": "application/json" },
  });
});
