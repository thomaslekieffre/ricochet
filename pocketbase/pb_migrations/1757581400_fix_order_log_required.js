/// <reference path="../pb_data/types.d.ts" />
/**
 * Correction trouvée en branchant le serveur de match (docs/PHASES.md P4) :
 * `matches.order_log` était `required: true`. PocketBase traite un tableau
 * JSON vide `[]` comme "vide" pour un champ required — exactement le même
 * piège que les NumberField à 0, déjà documenté dans 1757581200_core.js, mais
 * cette fois sur un JSONField. Un forfait au tour 0 (un joueur quitte avant
 * d'avoir envoyé un seul `Order`) produit un `order_log` vide et légitime :
 * la route `settle-match` le rejetait avec `validation_required`. Testé en
 * local : `POST /api/settle-match` avec `orderLog: []` échoue avant ce
 * correctif, réussit après.
 */
migrate((app) => {
  const matches = app.findCollectionByNameOrId("matches");
  const field = matches.fields.getByName("order_log");
  field.required = false;
  app.save(matches);
}, (app) => {
  const matches = app.findCollectionByNameOrId("matches");
  const field = matches.fields.getByName("order_log");
  field.required = true;
  app.save(matches);
});
