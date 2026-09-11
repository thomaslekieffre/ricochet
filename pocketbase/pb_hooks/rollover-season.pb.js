/// <reference path="../pb_data/types.d.ts" />
/**
 * Ricochet — équivalent PocketBase de l'ancienne RPC Postgres
 * `rollover_season` (docs/PHASES.md P5). Bascule de saison : désactive
 * l'ancienne, crée la nouvelle, reporte les joueurs actifs avec soft reset
 * (mu * 0.6, phi >= 200 affiché). À appeler manuellement ou via une routine
 * planifiée (cron Coolify, pg_cron n'existe pas ici) — jamais depuis un
 * client, toujours protégé par le même secret que settle-match.
 *
 *   POST /api/rollover-season
 *   Header: X-Settle-Secret: <MATCH_SETTLE_SECRET>
 *   Body: { name: string, days?: number }   (days par défaut 56, une saison)
 */
routerAdd("POST", "/api/rollover-season", (e) => {
  const secret = $os.getenv("MATCH_SETTLE_SECRET");
  if (secret && e.request.header.get("X-Settle-Secret") !== secret) {
    throw e.forbiddenError("secret invalide", null);
  }

  const body = e.requestInfo().body;
  if (!body.name) throw e.badRequestError("name manquant", null);
  const days = body.days || 56;

  const SCALE = 173.7178;
  const MAX_PHI_200 = 200 / SCALE;

  let newSeasonId = "";
  $app.runInTransaction((txApp) => {
    const actives = txApp.findRecordsByFilter("seasons", "active = true", "", 500, 0);
    for (const s of actives) {
      s.set("active", false);
      txApp.save(s);
    }

    const startsAt = new DateTime();
    const endsAt = new DateTime(new Date(Date.now() + days * 86400000).toISOString());
    const season = new Record(txApp.findCollectionByNameOrId("seasons"), {
      name: body.name,
      starts: startsAt,
      ends: endsAt,
      active: true,
    });
    txApp.save(season);
    newSeasonId = season.id;

    // report des joueurs actifs (hors saison) avec soft reset vers la nouvelle saison
    const seasonRatingsCol = txApp.findCollectionByNameOrId("season_ratings");
    const played = txApp.findRecordsByFilter("ratings", "games > 0", "", 5000, 0);
    for (const r of played) {
      const sr = new Record(seasonRatingsCol, {
        season: newSeasonId,
        user: r.getString("user"),
        mu: r.getFloat("mu") * 0.6,
        phi: Math.max(r.getFloat("phi"), MAX_PHI_200),
        sigma: 0.06,
        games: 0,
        placement_left: 10,
        peak_rating: 0,
      });
      txApp.save(sr);
    }
  });

  return e.json(200, { ok: true, seasonId: newSeasonId });
});
