/// <reference path="../pb_data/types.d.ts" />
/**
 * Ricochet — Phase 5 : saisons classées, notation par saison.
 * Équivalent PocketBase de l'ancien supabase/migrations/0002_ranked.sql.
 *
 * Le règlement atomique (autrefois la RPC Postgres `settle_ranked_match`) et
 * la bascule de saison (`rollover_season`) vivent maintenant dans
 * pocketbase/pb_hooks/settle-match.pb.js et rollover-season.pb.js — PocketBase
 * n'a pas de fonctions SQL, ces routes tournent dans une transaction
 * (`$app.runInTransaction`).
 */
migrate((app) => {
  const seasons = new Collection({
    type: "base",
    name: "seasons",
    fields: [
      { type: "text", name: "name", required: true },
      { type: "date", name: "starts", required: true },
      { type: "date", name: "ends", required: true },
      { type: "bool", name: "active" },
    ],
    listRule: "",
    viewRule: "",
    createRule: null, // écrit uniquement par la route rollover-season (auth superuser)
    updateRule: null,
    deleteRule: null,
  });
  app.save(seasons);

  // lien matches -> season, ajouté maintenant que la collection existe
  const matches = app.findCollectionByNameOrId("matches");
  matches.fields.add(
    new RelationField({ name: "season", collectionId: seasons.id, maxSelect: 1 }),
  );
  app.save(matches);

  const users = app.findCollectionByNameOrId("users");
  const seasonRatings = new Collection({
    type: "base",
    name: "season_ratings",
    fields: [
      { type: "relation", name: "season", required: true, collectionId: seasons.id, maxSelect: 1 },
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      // pas de `required: true` sur les nombres qui peuvent légitimement valoir
      // 0 — PocketBase traite 0 comme "vide" pour un NumberField required
      // (testé en local, cf. commentaire équivalent dans 0001_core.js).
      { type: "number", name: "mu" },
      { type: "number", name: "phi", required: true }, // 200 / 173.7178 par défaut, jamais 0
      { type: "number", name: "sigma", required: true }, // jamais 0 en pratique
      { type: "number", name: "games", min: 0 },
      { type: "number", name: "placement_left", min: 0 }, // 10 -> 0 pendant les 10 premiers matchs classés
      { type: "number", name: "peak_rating", min: 0 }, // récompenses de saison = sur le pic
      { type: "date", name: "last_played" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_season_ratings_pair ON season_ratings (season, user)",
    ],
    listRule: "",
    viewRule: "",
    createRule: null, // écrit uniquement par settle-match (auth superuser)
    updateRule: null,
    deleteRule: null,
  });
  app.save(seasonRatings);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("season_ratings"));
  const matches = app.findCollectionByNameOrId("matches");
  matches.fields.removeByName("season");
  app.save(matches);
  app.delete(app.findCollectionByNameOrId("seasons"));
});
