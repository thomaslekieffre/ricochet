# Ricochet — PocketBase (Phases 4/5/7)

Remplace Supabase comme base du projet : Postgres + Auth + Edge Functions
Supabase → SQLite + Auth + hooks JS PocketBase, un seul binaire, auto-hébergé
sur le VPS via Coolify (comme `match` et `web`).

**Testé en local avec PocketBase v0.40.3** (`pb_migrations` appliquées,
`settle-match` et `rollover-season` appelés pour de vrai, règles d'accès
vérifiées) — voir le détail des vérifications dans `docs/PHASES.md`. Revalider
après toute mise à jour majeure de PocketBase (les migrations utilisent l'API
JS interne, susceptible d'évoluer entre versions).

## Démarrer en local

```bash
# télécharger le binaire pour ta plateforme :
# https://github.com/pocketbase/pocketbase/releases

./pocketbase serve \
  --dir ./pocketbase/pb_data \
  --migrationsDir ./pocketbase/pb_migrations \
  --hooksDir ./pocketbase/pb_hooks
```

Premier lancement : créer un superuser (équivalent de la service-role key
Supabase — c'est lui que le serveur de match utilise, jamais un compte
joueur) :

```bash
./pocketbase superuser create admin@example.com <mot-de-passe>
```

Dashboard admin : http://127.0.0.1:8090/_/

## Collections (équivalent des anciennes migrations SQL Supabase)

| Fichier | Contenu | Anciennement |
| --- | --- | --- |
| `pb_migrations/1757581200_core.js` | `users` (+ `account_xp`, `country`), `ratings`, `matches` | `supabase/migrations/0001_core.sql` |
| `pb_migrations/1757581260_ranked.js` | `seasons`, `season_ratings`, lien `matches.season` | `supabase/migrations/0002_ranked.sql` |
| `pb_migrations/1757581320_cosmetics.js` | `cosmetics`, `ownership`, `battlepass_progress` | `supabase/migrations/0003_cosmetics.sql` |

`users` est la collection auth intégrée de PocketBase — pas de table
`profiles` séparée, juste des champs en plus. Écriture de `ratings` /
`matches` / `seasons` / `season_ratings` / `ownership` / `battlepass_progress` :
**superuser uniquement** (`createRule`/`updateRule`/`deleteRule` = `null`),
jamais un compte joueur — c'est le serveur de match, authentifié comme
superuser, qui écrit via les routes ci-dessous.

**Piège trouvé en testant** : ne jamais mettre `required: true` sur un
`NumberField` qui peut légitimement valoir 0 (XP de départ, compteur de
parties…) — PocketBase traite 0 comme « vide » et rejette l'écriture. Voir
les commentaires dans chaque fichier de migration.

## Routes (équivalent des Edge Functions Supabase)

| Route | Remplace |
| --- | --- |
| `POST /api/settle-match` | Edge Function `settle-match` (insère `matches`, règle Glicko-2 si classé, XP) |
| `POST /api/rollover-season` | RPC `rollover_season` (bascule de saison, soft reset) |

Les deux vivent dans `pb_hooks/*.pb.js`, tournent dans le process PocketBase
(pas de déploiement séparé), et sont protégées par un secret partagé :

```
Header: X-Settle-Secret: <MATCH_SETTLE_SECRET>
```

`MATCH_SETTLE_SECRET` est lu via `$os.getenv(...)` — la variable doit être
présente dans l'environnement du process PocketBase (voir `.env.example`). Si
elle est absente, la route n'exige aucun secret (pratique en dev local,
**à toujours définir en prod**).

Le calcul Glicko-2 est dupliqué en JS pur dans `settle-match.pb.js` (goja,
le moteur JS de PocketBase, n'importe pas les modules TS du dépôt) — il DOIT
rester synchro avec `src/lib/glicko2.ts`, la source de vérité testée par
`src/lib/glicko2.test.ts`.

**Piège trouvé en testant** : les fonctions utilisées par une route doivent
être déclarées *à l'intérieur* du handler `routerAdd(...)` — un helper défini
au niveau fichier lève `ReferenceError: ... is not defined` une fois appelé
(le hook ne semble pas hériter des déclarations de fonctions du scope fichier
au moment de l'exécution de la route).

## Branchement serveur de match ↔ PocketBase (fait 2026-09-11)

`server/server.ts` vérifie le JWT envoyé dans `QueueSetup.token` via
`POST /auth-refresh` (best-effort : token absent/invalide = invité, jamais
bloquant) et appelle `POST /api/settle-match` à la fin de chaque match en
ligne (victoire réelle ou forfait). `src/net/session.ts` gère la session côté
navigateur en `fetch` brut (pas le SDK officiel — zéro dépendance runtime).
Testé en vrai : compte créé, match complet joué à travers deux clients
WebSocket, `matches` + `account_xp` vérifiés en base. Voir `docs/PHASES.md` §
Phase 4 pour le détail (y compris un bug de schéma trouvé et corrigé au
passage : `order_log` ne doit pas être `required`).

## Ce qui reste à faire (avec toi, cf. docs/PHASES.md)

- Client : écran connexion/profil (DOM) qui appelle `session.ts`.
- Matchmaking par fenêtre de note dans `server/server.ts`, puis bascule vers
  `mode: "ranked"` dans l'appel `settle-match`.
- Déploiement réel sur le VPS (image Docker officielle PocketBase, service
  Coolify à côté de `match`/`web`).
