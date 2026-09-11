/// <reference path="../pb_data/types.d.ts" />
/**
 * Ricochet — Phase 7 : cosmétiques (zéro power à vendre), pass de saison.
 * Équivalent PocketBase de l'ancien supabase/migrations/0003_cosmetics.sql.
 *
 * `cosmetics.id` est l'id PocketBase généré (pas un slug lisible comme en SQL) ;
 * `slug` porte l'identifiant stable utilisé par le contenu (table palier ->
 * cosmétique) pour éviter de dépendre de l'id interne.
 */
migrate((app) => {
  const cosmetics = new Collection({
    type: "base",
    name: "cosmetics",
    fields: [
      { type: "text", name: "slug", required: true }, // ex. "boulder_or", stable, référencé par le contenu
      {
        type: "select",
        name: "kind",
        required: true,
        maxSelect: 1,
        values: ["hero_skin", "arena_skin", "border", "title"],
      },
      { type: "text", name: "name", required: true },
      {
        type: "select",
        name: "rarity",
        required: true,
        maxSelect: 1,
        values: ["common", "rare", "epic", "seasonal"],
      },
      {
        type: "select",
        name: "source",
        required: true,
        maxSelect: 1,
        values: ["battlepass_free", "battlepass_premium", "rank_reward", "shop"],
      },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_cosmetics_slug ON cosmetics (slug)"],
    listRule: "",
    viewRule: "",
    createRule: null, // contenu géré en superuser (admin UI ou migration)
    updateRule: null,
    deleteRule: null,
  });
  app.save(cosmetics);

  const users = app.findCollectionByNameOrId("users");
  const ownership = new Collection({
    type: "base",
    name: "ownership",
    fields: [
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "cosmetic", required: true, collectionId: cosmetics.id, maxSelect: 1, cascadeDelete: true },
      { type: "autodate", name: "acquired", onCreate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_ownership_pair ON ownership (user, cosmetic)"],
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: null, // écrit uniquement par settle-match / achat de pass (auth superuser)
    updateRule: null,
    deleteRule: null,
  });
  app.save(ownership);

  const seasons = app.findCollectionByNameOrId("seasons");
  const battlepass = new Collection({
    type: "base",
    name: "battlepass_progress",
    fields: [
      { type: "relation", name: "season", required: true, collectionId: seasons.id, maxSelect: 1 },
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      // pas de `required: true` : tier=0 (avant le 1er palier) et xp=0 sont
      // des valeurs de départ légitimes (cf. commentaire dans 0001_core.js).
      { type: "number", name: "tier", min: 0 },
      { type: "number", name: "xp", min: 0 },
      { type: "bool", name: "premium" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_battlepass_pair ON battlepass_progress (season, user)",
    ],
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: null, // écrit uniquement par settle-match (auth superuser)
    updateRule: null,
    deleteRule: null,
  });
  app.save(battlepass);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("battlepass_progress"));
  app.delete(app.findCollectionByNameOrId("ownership"));
  app.delete(app.findCollectionByNameOrId("cosmetics"));
});
