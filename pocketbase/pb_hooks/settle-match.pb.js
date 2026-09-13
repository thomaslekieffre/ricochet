/// <reference path="../pb_data/types.d.ts" />
/**
 * Ricochet — équivalent PocketBase de l'ancienne Edge Function Supabase
 * `settle-match` (docs/PHASES.md P4 + P5). Appelée par le serveur de match
 * (jamais par un client) à la fin de chaque partie :
 *
 *   POST /api/settle-match
 *   Header: X-Settle-Secret: <MATCH_SETTLE_SECRET>   (voir .env.example)
 *   Body: { mode, arena, seat0?, seat1?, team0, team1, winner?, hold0, hold1,
 *           turns, orderLog }
 *
 * Insère la ligne `matches` (rejouable via order_log) et, si `ranked` avec
 * les deux sièges identifiés, recalcule Glicko-2 pour les deux joueurs et
 * l'applique atomiquement (transaction) : `ratings`, `season_ratings`,
 * XP de pass + XP de compte.
 *
 * Le calcul Glicko-2 DOIT rester synchro avec src/lib/glicko2.ts (source de
 * vérité) — dupliqué ici en JS pur car goja (le moteur JS de PocketBase)
 * n'importe pas les modules TS du dépôt.
 *
 * NB testé en local (pocketbase serve) : toutes les fonctions utilisées par
 * le handler doivent être déclarées À L'INTÉRIEUR de celui-ci — un helper
 * défini au niveau fichier lève `ReferenceError: ... is not defined` une fois
 * appelé depuis la route (le hook tourne dans un contexte goja qui n'hérite
 * pas des déclarations de fonctions du scope fichier).
 */
routerAdd("POST", "/api/settle-match", (e) => {
  const SCALE = 173.7178;
  const MAX_PHI = 350 / SCALE;

  function g(phi) {
    return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
  }
  function eScore(mu, mj, pj) {
    return 1 / (1 + Math.exp(-g(pj) * (mu - mj)));
  }

  /** Un pas Glicko-2 pour un joueur face à un adversaire, score dans {0, 0.5, 1}. */
  function glickoUpdate(p, oppo, score, tau) {
    tau = tau || 0.5;
    const sc = eScore(p.mu, oppo.mu, oppo.phi);
    const v = 1 / (g(oppo.phi) * g(oppo.phi) * sc * (1 - sc));
    const dSum = g(oppo.phi) * (score - sc);
    const delta = v * dSum;
    const a = Math.log(p.sigma * p.sigma);
    const p2 = p.phi * p.phi;
    const f = (x) => {
      const ex = Math.exp(x);
      return (
        (ex * (delta * delta - p2 - v - ex)) / (2 * (p2 + v + ex) * (p2 + v + ex)) -
        (x - a) / (tau * tau)
      );
    };
    let A = a;
    let B;
    if (delta * delta > p2 + v) {
      B = Math.log(delta * delta - p2 - v);
    } else {
      let k = 1;
      while (f(a - k * tau) < 0) k++;
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
        fA /= 2;
      }
      B = C;
      fB = fC;
    }
    const sigma = Math.exp(A / 2);
    const phiStar = Math.sqrt(p2 + sigma * sigma);
    const phi = Math.min(1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v), MAX_PHI);
    return { mu: p.mu + phi * phi * dSum, phi: phi, sigma: sigma };
  }

  function findOne(app, collection, filter, params) {
    try {
      return app.findFirstRecordByFilter(collection, filter, params || {});
    } catch (err) {
      return null;
    }
  }

  function ratingOrDefault(app, userId) {
    return (
      findOne(app, "ratings", "user = {:u}", { u: userId }) ||
      new Record(app.findCollectionByNameOrId("ratings"), {
        user: userId,
        mu: 0,
        phi: MAX_PHI,
        sigma: 0.06,
        games: 0,
      })
    );
  }

  function bumpSeasonRating(app, seasonId, userId, r, peak) {
    let rec = findOne(app, "season_ratings", "season = {:s} && user = {:u}", {
      s: seasonId,
      u: userId,
    });
    if (rec) {
      rec.set("mu", r.mu);
      rec.set("phi", r.phi);
      rec.set("sigma", r.sigma);
      rec.set("games", rec.getFloat("games") + 1);
      rec.set("placement_left", Math.max(rec.getFloat("placement_left") - 1, 0));
      rec.set("peak_rating", Math.max(rec.getFloat("peak_rating"), peak));
      rec.set("last_played", new DateTime());
    } else {
      rec = new Record(app.findCollectionByNameOrId("season_ratings"), {
        season: seasonId,
        user: userId,
        mu: r.mu,
        phi: r.phi,
        sigma: r.sigma,
        games: 1,
        placement_left: 9,
        peak_rating: Math.max(peak, 0),
        last_played: new DateTime(),
      });
    }
    app.save(rec);
  }

  function bumpAccountXp(app, userId, xp) {
    const user = app.findRecordById("users", userId);
    user.set("account_xp", user.getFloat("account_xp") + xp);
    app.save(user);
  }

  /** XP de pass ; débloque les cosmétiques de la piste franchie (gratuite, + premium si acheté). */
  function grantBattlepassXp(app, seasonId, userId, xp) {
    let bp = findOne(app, "battlepass_progress", "season = {:s} && user = {:u}", {
      s: seasonId,
      u: userId,
    });
    if (!bp) {
      bp = new Record(app.findCollectionByNameOrId("battlepass_progress"), {
        season: seasonId,
        user: userId,
        tier: 0,
        xp: 0,
        premium: false,
      });
    }
    const prevTier = bp.getFloat("tier");
    const premium = bp.getBool("premium");
    const newXp = bp.getFloat("xp") + xp;
    const newTier = Math.min(Math.floor(newXp / 1000), 60); // 1000 XP / palier, cap 60
    bp.set("xp", newXp);
    bp.set("tier", newTier);
    app.save(bp);

    if (newTier <= prevTier) return;
    // Table palier -> cosmétique : le champ `tier` de `cosmetics` (seedé dans
    // 1757581380_battlepass_tiers.js) porte le palier requis. `tier <= newTier`
    // (pas une fenêtre [prevTier, newTier]) pour que passer en premium en
    // cours de saison rattrape aussi les paliers premium déjà franchis —
    // idempotent grâce à la vérification `owned` ci-dessous.
    const filter = premium
      ? "tier <= {:cur} && (source = 'battlepass_free' || source = 'battlepass_premium')"
      : "tier <= {:cur} && source = 'battlepass_free'";
    const unlocked = app.findRecordsByFilter("cosmetics", filter, "", 500, 0, {
      cur: newTier,
    });
    const ownershipCol = app.findCollectionByNameOrId("ownership");
    for (const c of unlocked) {
      const owned = findOne(app, "ownership", "user = {:u} && cosmetic = {:c}", {
        u: userId,
        c: c.id,
      });
      if (!owned) app.save(new Record(ownershipCol, { user: userId, cosmetic: c.id }));
    }
  }

  const secret = $os.getenv("MATCH_SETTLE_SECRET");
  if (secret && e.request.header.get("X-Settle-Secret") !== secret) {
    throw e.forbiddenError("secret invalide", null);
  }

  const body = e.requestInfo().body;
  if (!body.mode || !body.arena || !body.team0 || !body.team1 || !body.orderLog) {
    throw e.badRequestError("payload incomplet", null);
  }

  let seasonId = null;
  if (body.mode === "ranked") {
    const season = findOne($app, "seasons", "active = true", {});
    if (season) seasonId = season.id;
  }

  let matchId = "";
  $app.runInTransaction((txApp) => {
    const match = new Record(txApp.findCollectionByNameOrId("matches"), {
      mode: body.mode,
      season: seasonId,
      arena: body.arena,
      seat0: body.seat0 || null,
      seat1: body.seat1 || null,
      team0: body.team0,
      team1: body.team1,
      winner: body.winner,
      hold0: body.hold0,
      hold1: body.hold1,
      turns: body.turns,
      order_log: body.orderLog,
      ended: new DateTime(),
    });
    txApp.save(match);
    matchId = match.id;

    if (body.mode === "ranked" && body.seat0 && body.seat1 && seasonId) {
      const ra = ratingOrDefault(txApp, body.seat0);
      const rb = ratingOrDefault(txApp, body.seat1);
      const a = { mu: ra.getFloat("mu"), phi: ra.getFloat("phi"), sigma: ra.getFloat("sigma") };
      const b = { mu: rb.getFloat("mu"), phi: rb.getFloat("phi"), sigma: rb.getFloat("sigma") };
      const scoreA = body.winner === 0 ? 1 : 0;
      const na = glickoUpdate(a, b, scoreA);
      const nb = glickoUpdate(b, a, 1 - scoreA);

      ra.set("mu", na.mu);
      ra.set("phi", na.phi);
      ra.set("sigma", na.sigma);
      ra.set("games", ra.getFloat("games") + 1);
      txApp.save(ra);
      rb.set("mu", nb.mu);
      rb.set("phi", nb.phi);
      rb.set("sigma", nb.sigma);
      rb.set("games", rb.getFloat("games") + 1);
      txApp.save(rb);

      bumpSeasonRating(txApp, seasonId, body.seat0, na, Math.round(1500 + SCALE * na.mu));
      bumpSeasonRating(txApp, seasonId, body.seat1, nb, Math.round(1500 + SCALE * nb.mu));
    }

    for (const uid of [body.seat0, body.seat1]) {
      if (!uid) continue;
      if (seasonId) grantBattlepassXp(txApp, seasonId, uid, 120);
      bumpAccountXp(txApp, uid, 80);
    }
  });

  return e.json(200, { ok: true, matchId: matchId });
});
