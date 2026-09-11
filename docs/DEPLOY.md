# Déploiement — Ricochet

État : le jeu local (P1-2) et le serveur autoritatif (P3) tournent. Le schéma
PocketBase (P4/P5/P7) est écrit, **testé en local** (migrations appliquées,
`settle-match`/`rollover-season` appelés pour de vrai, règles d'accès
vérifiées — voir `pocketbase/README.md`), mais **jamais branché au serveur de
match ni déployé en prod**. Ce runbook décrit la cible.

## Topologie

| Composant | Rôle | Port |
| --- | --- | --- |
| `web` | build Vite statique | 4173 (derrière un reverse-proxy TLS) |
| `match` | serveur WebSocket autoritatif (Node + ws) | 8787 |
| `pocketbase` | comptes, notation, matchs, cosmétiques (SQLite + Auth) | 8090 (dashboard sur `/_/`) |

Trois images, orchestrées par Coolify sur le VPS : `Dockerfile` (cibles `web` /
`match`) + `pocketbase/Dockerfile`. `docker compose up --build` reproduit la
topo en local (voir `docker-compose.yml`).

## Variables d'environnement

Voir `.env.example`. Résumé :

- **web** : `VITE_POCKETBASE_URL`, `VITE_MATCH_SERVER` (ex.
  `wss://ricochet-match.example.com`).
- **match** : `PORT`, `POCKETBASE_URL`, `MATCH_SETTLE_SECRET`.
- **pocketbase** : rien de secret dans l'image — le superuser se crée en CLI
  (`pocketbase superuser create ...`) ou au premier lancement via l'URL
  d'installation affichée dans les logs. `MATCH_SETTLE_SECRET` doit être
  présent dans l'environnement du conteneur (même valeur que côté `match`).

## Ordre de démarrage

1. **PocketBase** : déployer l'image `pocketbase` (migrations dans
   `pb_migrations/` appliquées automatiquement au démarrage — `--automigrate`
   est activé par défaut). Créer le superuser. Vérifier `GET /api/health`.
2. **Saison 0** : `curl -X POST $POCKETBASE_URL/api/rollover-season -H "X-Settle-Secret: $MATCH_SETTLE_SECRET" -d '{"name":"Saison 0"}'`.
3. **match** : déployer l'image `match` avec `POCKETBASE_URL` et
   `MATCH_SETTLE_SECRET` pointant sur PocketBase. Vérifier `GET /healthz`.
4. **web** : déployer l'image `web` avec `VITE_MATCH_SERVER` pointant sur
   `match` et `VITE_POCKETBASE_URL` sur PocketBase.

## Bascule de saison

`POST /api/rollover-season` (voir `pocketbase/README.md`) — désactive
l'ancienne, crée la nouvelle, reporte les joueurs avec soft reset (`mu * 0.6`,
`phi >= 200`). À planifier via une routine Coolify (pas de `pg_cron` avec
PocketBase). Les récompenses (sur `season_ratings.peak_rating`) sont
distribuées avant la bascule.

## Rollback

- **web / match / pocketbase** : redéployer l'image précédente via Coolify.
  `web`/`match` sont immuables, sans état propre. `pocketbase` porte l'état
  dans son volume SQLite (`pb_data`) — sauvegarder ce volume avant toute
  bascule de version.
- **Migrations** : chaque fichier `pb_migrations/*.js` a un callback de
  rollback (`migrate(up, down)`) — `pocketbase migrate down [n]` revient en
  arrière. Revalider en local après toute mise à jour de version PocketBase
  (l'API JS interne peut changer entre versions).

## Anti-triche en prod (P7)

- Rate-limit par IP et par JWT sur `queue` et `order` (au niveau `match`).
- Détection d'anomalies : winrate, temps de réponse, hash de désync répétés —
  tâche de fond qui lit `matches` (lecture publique, pas besoin du superuser).
- Tout match est rejouable depuis `matches.order_log` + `newMatch(setup)` pour
  audit manuel.

## Pré-requis avant d'ouvrir les comptes au public

- [ ] Image `pocketbase` déployée, migrations appliquées, superuser créé
- [ ] `MATCH_SETTLE_SECRET` défini côté `match` ET `pocketbase`, identique
- [ ] `settle-match` testée avec un match ranked factice sur l'instance de prod
- [ ] Bascule de saison testée sur une saison de 24 h en staging
- [ ] Table de mapping palier de pass → cosmétique remplie (contenu Saison 1)
- [ ] Rate-limits activés côté `match`
- [ ] Sauvegarde régulière du volume `pb_data` (SQLite — pas de réplication
      managée comme avec Supabase, c'est maintenant à nous)
