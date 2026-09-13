/// <reference path="../pb_data/types.d.ts" />
/**
 * Ricochet — table palier -> cosmétique du pass de saison (docs/PHASES.md P7).
 * `1757581320_cosmetics.js` posait le schéma sans contenu ; `settle-match.pb.js`
 * (`grantBattlepassXp`) débloquait jusqu'ici TOUT ce qui matchait `source`
 * dès le premier palier franchi, faute de savoir "quel palier débloque quoi".
 *
 * Contenu volontairement minimal pour cette V1 (un palier = un cosmétique,
 * pas de table Excel) : uniquement `title`/`border`, aucun `hero_skin`/
 * `arena_skin` (demanderait de vrais sprites alternatifs — même pipeline
 * bloqué que les animations de héros, cf. docs/PHASES.md). Le schéma
 * supporte déjà ces deux types, du contenu pourra y être ajouté plus tard
 * sans nouvelle migration de schéma.
 */
migrate((app) => {
  const cosmetics = app.findCollectionByNameOrId("cosmetics");
  cosmetics.fields.add(new NumberField({ name: "tier", required: true, min: 1 }));
  app.save(cosmetics);

  const rows = [
    { slug: "title_debutant", kind: "title", name: "Débutant", rarity: "common", source: "battlepass_free", tier: 1 },
    { slug: "title_regulier", kind: "title", name: "Régulier", rarity: "common", source: "battlepass_free", tier: 5 },
    { slug: "border_bronze", kind: "border", name: "Bordure Bronze", rarity: "rare", source: "battlepass_free", tier: 10 },
    { slug: "title_elite_pass", kind: "title", name: "Élite du pass", rarity: "epic", source: "battlepass_premium", tier: 15 },
    { slug: "border_or", kind: "border", name: "Bordure Or", rarity: "epic", source: "battlepass_premium", tier: 30 },
    {
      slug: "title_legende_s1",
      kind: "title",
      name: "Légende — Saison 1",
      rarity: "seasonal",
      source: "battlepass_premium",
      tier: 60,
    },
  ];
  for (const r of rows) app.save(new Record(cosmetics, r));
}, (app) => {
  const cosmetics = app.findCollectionByNameOrId("cosmetics");
  const slugs = [
    "title_debutant",
    "title_regulier",
    "border_bronze",
    "title_elite_pass",
    "border_or",
    "title_legende_s1",
  ];
  for (const slug of slugs) {
    const rec = app.findFirstRecordByFilter("cosmetics", "slug = {:s}", { s: slug });
    if (rec) app.delete(rec);
  }
  cosmetics.fields.removeByName("tier");
  app.save(cosmetics);
});
