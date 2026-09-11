/// <reference path="../pb_data/types.d.ts" />
/**
 * Ricochet — Phase 4 : comptes, notation cachée, historique des matchs.
 * Équivalent PocketBase de l'ancien supabase/migrations/0001_core.sql.
 *
 * `users` est la collection auth intégrée de PocketBase — pas de table
 * `profiles` séparée : on lui ajoute juste les champs publics du profil.
 * Écritures : le serveur de match s'authentifie en superuser (voir
 * pocketbase/README.md) pour `ratings`/`matches` — aucune policy create/update
 * n'est donnée aux comptes normaux sur ces deux collections.
 */
migrate((app) => {
  // --- users : + pseudo public, XP de compte, pays -------------------------
  const users = app.findCollectionByNameOrId("users");
  // pas de `required: true` sur les nombres qui démarrent légitimement à 0 —
  // PocketBase traite 0 comme "vide" pour un NumberField required (testé en
  // local : une création avec account_xp=0 est rejetée "Cannot be blank").
  users.fields.add(new NumberField({ name: "account_xp", min: 0 }));
  users.fields.add(new TextField({ name: "country", max: 2 }));
  // profil (pseudo, xp, pays) lisible par tous ; le reste (email...) reste
  // protégé par les règles par défaut de la collection users.
  users.listRule = "";
  users.viewRule = "";
  app.save(users);

  // --- ratings : notation Glicko-2 courante (hors saison) -------------------
  const ratings = new Collection({
    type: "base",
    name: "ratings",
    fields: [
      {
        type: "relation",
        name: "user",
        required: true,
        collectionId: users.id,
        maxSelect: 1,
        cascadeDelete: true,
      },
      { type: "number", name: "mu" }, // échelle Glicko-2, 0 = 1500 affiché (pas required : 0 est valide)
      { type: "number", name: "phi", required: true }, // 350 / 173.7178 par défaut, jamais 0
      { type: "number", name: "sigma", required: true }, // jamais 0 en pratique (défaut 0.06)
      { type: "number", name: "games", min: 0 }, // pas required : 0 au départ
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_ratings_user ON ratings (user)"],
    listRule: "",
    viewRule: "",
    createRule: null, // écrit uniquement par le serveur de match (auth superuser)
    updateRule: null,
    deleteRule: null,
  });
  app.save(ratings);

  // --- matches : source de vérité, rejouable via order_log ------------------
  const matches = new Collection({
    type: "base",
    name: "matches",
    fields: [
      {
        type: "select",
        name: "mode",
        required: true,
        maxSelect: 1,
        values: ["unranked", "ranked"],
      },
      { type: "text", name: "arena", required: true },
      { type: "relation", name: "seat0", collectionId: users.id, maxSelect: 1 },
      { type: "relation", name: "seat1", collectionId: users.id, maxSelect: 1 },
      { type: "json", name: "team0", required: true, maxSize: 2000 }, // [HeroKind, HeroKind, HeroKind]
      { type: "json", name: "team1", required: true, maxSize: 2000 },
      { type: "number", name: "winner", min: 0, max: 1 }, // 0 | 1, absent si sans vainqueur
      { type: "number", name: "hold0" },
      { type: "number", name: "hold1" },
      { type: "number", name: "turns" },
      { type: "json", name: "order_log", required: true, maxSize: 500000 }, // [[OrderA, OrderB], ...]
      { type: "autodate", name: "created", onCreate: true },
      { type: "date", name: "ended" },
    ],
    indexes: [
      "CREATE INDEX idx_matches_seat0 ON matches (seat0, created)",
      "CREATE INDEX idx_matches_seat1 ON matches (seat1, created)",
    ],
    listRule: "",
    viewRule: "",
    createRule: null, // écrit uniquement par le serveur de match (auth superuser)
    updateRule: null,
    deleteRule: null,
  });
  app.save(matches);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("matches"));
  app.delete(app.findCollectionByNameOrId("ratings"));
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("account_xp");
  users.fields.removeByName("country");
  app.save(users);
});
