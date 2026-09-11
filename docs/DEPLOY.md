# Déploiement — Ricochet

État : le jeu local (P1-2) et le serveur autoritatif (P3) tournent. Les phases
4-7 (comptes, classé, saisons, pass) ont leur schéma et leur code, **non
vérifiés contre une base live**. Ce runbook décrit la cible.

## Topologie

| Composant | Rôle | Port |
| --- | --- | --- |
| `web` | build Vite statique | 4173 (derrière un reverse-proxy TLS) |
| `match` | serveur WebSocket autoritatif (Node + ws) | 8787 |
| Supabase | Postgres + Auth + Edge Functions | instance existante (voir `infra.md`) |

`web` et `match` : une seule image (`Dockerfile`, cibles `web` / `match`),
orchestrée par Coolify sur le VPS. `docker compose up --build` reproduit la topo
en local.

## Variables d'environnement

Voir `.env.example`. Résumé :

- **web** : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MATCH_SERVER`
  (ex. `wss://ricochet-match.example.com`).
- **match** : `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SETTLE_MATCH_URL`.
- Edge Function : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (fournis par la
  plateforme Supabase).

## Ordre de démarrage

1. **Base** : `supabase db push` (applique `supabase/migrations/0001..0003`).
2. **Edge Function** : `supabase functions deploy settle-match --no-verify-jwt`.
3. **Saison 0** : `select rollover_season('Saison 0', 56);` (ou 1 pour un test).
4. **match** : déployer l'image `match`. Vérifier `GET /healthz`.
5. **web** : déployer l'image `web` avec `VITE_MATCH_SERVER` pointant sur `match`.

## Bascule de saison

`select rollover_season('Saison N', 56);` — désactive l'ancienne, crée la
nouvelle, reporte les joueurs avec soft reset (`mu * 0.6`, `phi >= 200`).
À planifier via `pg_cron` ou une routine Coolify. Les récompenses (sur
`season_ratings.peak_rating`) sont distribuées avant la bascule.

## Rollback

- **web / match** : redéployer l'image précédente via Coolify (immuable, sans état
  propre — l'état vit dans Postgres).
- **base** : chaque migration est idempotente (`if not exists`, `create or
  replace`). Pas de `down` automatique ; un rollback de schéma se fait par
  migration corrective explicite.
- **Edge Function** : `supabase functions deploy` sur la version antérieure.

## Anti-triche en prod (P7)

- Rate-limit par IP et par JWT sur `queue` et `order` (au niveau `match`).
- Détection d'anomalies : winrate, temps de réponse, hash de désync répétés —
  tâche de fond qui lit `matches`.
- Tout match est rejouable depuis `matches.order_log` + `newMatch(setup)` pour
  audit manuel.

## Pré-requis avant d'ouvrir les comptes au public

- [ ] `supabase db push` OK sur l'instance de prod
- [ ] `settle-match` déployée, testée avec un match ranked factice
- [ ] Bascule de saison testée sur une saison de 24 h en staging
- [ ] Table de mapping palier de pass → cosmétique remplie (contenu Saison 1)
- [ ] Rate-limits activés côté `match`
