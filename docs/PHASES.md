# Ricochet — les phases

Plan de référence. Chaque phase a un **objectif unique**, un périmètre fermé, et
une definition of done (voir `CLAUDE.md` § « recette »). On ne commence une phase
que quand la précédente est verte.

| # | Phase | État |
|---|---|---|
| 1 | Le choc — solveur de knockback déterministe | ✅ Fait |
| 2 | Le jeu complet en local — mode Contrôle, 6 héros, 3 arènes, bot, hotseat | ✅ Fait |
| 3 | Serveur autoritatif — 1v1 en ligne, sans compte | ✅ Fait |
| 4 | Comptes + matchmaking + file non classée | 🟡 Partiel — **profil local fait** (`src/lib/profile.ts`) ; schéma + Edge Function écrits, pas branchés |
| 5 | Classé Glicko-2 + saisons | 🟡 Partiel — `glicko2.ts` fait + testé, **note cachée locale vs bot faite**, migrations écrites |
| 6 | Draft ban/pick + roster complet + replays + spectate | ✅ Fait |
| 7 | Pass de saison + cosmétiques + déploiement | 🟡 Partiel — migrations + `DEPLOY.md` + Docker |

Légende : 🟡 = la partie qui ne touche pas le VPS de prod est faite et testée
(y compris contre une instance PocketBase locale, voir P4/P5/P7) ; le reste
attend le déploiement réel et se fait avec toi.

---

## Phase 1 — Le choc ✅

**Objectif** : prouver que percuter est jouissif, avec le socle déterministe.

**Livré**

- `engine/fixed.ts` — Q16.16 sur BigInt (`mul`, `div`, `sqrt`), déterministe au bit.
- `engine/solver.ts` — `resolve()` pur : intégration à pas fixe, friction,
  collisions cercle-cercle avec restitution, KO en sortie de terrain.
- `engine/trig.ts` — sin/cos par table, angle → index.
- Rendu Canvas, visée angle + jauge de puissance.
- `scripts/check.ts` — déterminisme (2 runs identiques), stabilité (aucun NaN),
  replay (le log d'ordres reproduit l'état).

---

## Phase 2 — Le jeu complet en local ✅

**Objectif** : un jeu solo/hotseat complet et amusant, sans réseau.

**Livré**

- **Mode Contrôle** : à la fin de chaque tour, le camp qui a le plus de héros
  vivants dans la zone centrale marque +1. Premier à `targetHold` (15), sinon
  meilleur score à `maxTurns` (60) ; égalité → mort subite, la zone rétrécit.
- **Structure BUMP** : équipe de 3, **1 seul héros bouge par tour**, planification
  simultanée puis résolution simultanée.
- **6 héros** (`engine/heroes.ts`), chacun base + active (coûte du Momentum,
  jauge +1/tour plafonnée à 5) + passive :
  - **Boulder** (brawler) — slam lourd ; _Quake_ : onde radiale ; encaisse -30 %.
  - **Ram** (brawler) — knockback ∝ distance de charge ; _Second Souffle_ : relance.
  - **Comet** (dasher) — traverse les corps ; _Slipstream_ : intouchable ; +Momentum/passage.
  - **Hook** (dasher) — tire la cible au contact ; _Grappin_ : prise à distance.
  - **Sling** (sniper) — projectile en ligne ; _Ricochet_ : rebond mural ; +kb s'il n'a pas bougé.
  - **Prism** (mage) — _Éclat_ à retardement ; _Mur_ : barrière temporaire.
- **3 arènes** (`engine/arenas.ts`) : Carrefour (nu), Fonderie (tapis roulants),
  Flipper (bumpers élastiques). Le bord = ligne de KO partout.
- **Bot** 1-ply glouton (`engine/bot.ts`), 3 niveaux ; **hotseat** avec rideau.
- **Juice** : screen shake, SFX synthétisés, glow sur charge, tint de zone selon
  le contrôle.
- Écrans DOM : menu (adversaire / niveau / arène), draft (chacun 3 héros parmi 6,
  compos autorisées à se recouper), résultat.
- **Tests** : `solver.test.ts` (déterminisme, non-NaN sur 250 tours, bornes
  Momentum, une capture se produit, la partie se termine à la cible).

**Lisibilité des capacités (fait 2026-09-08)** : fiche structurée par héros
(`base` / `ability` / `passive` dans `heroes.ts`) ; **barre d'action** en match
(`#actionbar`, `ui.ts`/`match.ts`/`styles.css`) qui affiche le kit du héros
sélectionné + un vrai bouton d'armement (`A`) avec états armable / armé /
insuffisant ; **jauge de Momentum segmentée** (5 cases) qui montre la dépense de
la capacité armée en orange ; **codex** accessible du menu et par les cartes de
draft ; retour visuel sur le canvas (`renderer.ts`) : nom de la capacité en
gros à la casse haute, onde de choc à 3 anneaux pour Quake / détonation d'Éclat,
Mur temporaire rendu distinctement (or, pointillé, halo), ligne de portée du
Grappin, traînée sur le projectile Ricochet, `prefers-reduced-motion` respecté.

**Bot dans un Web Worker (fait 2026-09-11)** : `pickOrder` (pur, sans DOM)
tourne maintenant dans `src/game/bot.worker.ts`, appelé via `BotClient`
(`src/game/bot-client.ts`) depuis `match.ts` — ne bloque plus le thread
principal (le niveau Coriace, le plus lourd, ne gèle plus le rendu). Vite le
bundle en chunk séparé (`dist/assets/bot.worker-*.js`).

**Reste à faire dans P2 (polish, pas bloquant)** : passer le rendu sur PixiJS
si le Canvas 2D montre ses limites ; équilibrage réel des 8 héros par des
parties.

---

## Phase 3 — Serveur autoritatif (1v1 en ligne, sans compte) ✅

**Objectif** : deux navigateurs jouent le même match, le serveur est la vérité.
Aucune notion de compte encore.

**Livré**

- `src/engine/trig-table.ts` — table de sinus **figée** en constante base64
  (générée par `scripts/gen-trig-table.mjs`), plus un test qui la revalide.
- `src/engine/hash.ts` — `hashState()` FNV-1a sur la tranche de simulation.
- `server/server.ts` — Node + `ws` (pas Bun : absent de la machine ; `ws` est
  portable). File d'attente, orchestrateur de matchs, `/healthz`, `sanitize()`
  des ordres reçus, deadlines (12 s planif serveur, 8 s prompt client).
- `src/net/protocol.ts` + `src/net/client.ts` — messages typés, wrapper WS.
- `src/game/match.ts` — mode `sides` avec `"remote"` ; en ligne le client
  n'appelle jamais `resolve()`, il anime les `frames` du serveur.
- `Dockerfile` + `docker-compose.yml` (cibles `web` et `match`).
- **Test** : `npm run net-test` — deux clients Node, 30 tours, le résolveur local
  reproduit le hash serveur à **chaque** tour, hash identiques des deux côtés.

**Reste** : reconnexion réelle (le `resync` existe mais n'est pas branché au
client) ; spectateurs (Phase 6).

### Spec d'origine (conservée pour référence)

**Pourquoi c'est peu coûteux** : la cadence est au tour (8 s), pas au frame. Le
serveur ne reçoit qu'un `Order` par joueur et par tour, simule d'un bloc, renvoie
le résultat. Pas de rollback, pas d'UDP.

### Préalable — figer le déterminisme inter-machines

- Remplacer la table `SIN[]` de `trig.ts` par une **constante versionnée**
  (générée une fois, commitée). Ajouter un test qui vérifie le hash de la table.
- Ajouter `engine/hash.ts` : hash stable d'un `GameState` (déjà esquissé dans les
  tests). Le client et le serveur comparent leur hash après chaque tour.

### Protocole WebSocket (JSON, un message par ligne)

Client → serveur :

| type | charge | quand |
|---|---|---|
| `queue` | `{ setup: MatchSetup }` | rejoindre la file 1v1 |
| `order` | `{ matchId, turn, order: Order }` | à la fin de sa planification |
| `ready` | `{ matchId }` | animation terminée côté client |
| `ping` | `{ t }` | keepalive |

Serveur → client :

| type | charge |
|---|---|
| `matched` | `{ matchId, seat: 0\|1, state: GameState, deadlineMs }` |
| `turn` | `{ turn, frames: Frame[], events: TurnEvent[], state: GameState, hash }` |
| `deadline` | `{ turn, deadlineMs }` (relancé si un joueur tarde) |
| `opponentLeft` | `{ matchId }` |
| `over` | `{ matchId, winner }` |
| `pong` | `{ t }` |

### Boucle serveur (par match)

```
état = newMatch(setup)
à chaque tour :
  attendre order[0] et order[1] (ou deadline -> HOLD_ORDER pour le retardataire)
  { state, frames, events } = resolve(état, order[0], order[1])   // MÊME code que le client
  broadcast turn { frames, events, state, hash(state) }
  attendre ready des deux (ou timeout court)
  état = state
  si état.over -> broadcast over, fin
```

### Points

- **Résolveur partagé** : `src/engine/` est importé tel quel par le serveur Bun.
  Le client anime `frames`, ne simule jamais.
- **Validation d'`Order`** : `bodyId` appartient bien au siège, capacité
  abordable — sinon `HOLD`. Rejeter tout `turn` qui n'est pas le tour courant.
- **Anti-triche** : le serveur possède l'état ; le client ne peut mentir que sur
  son propre `Order`, toujours borné. Log de tous les ordres → tout match est
  rejouable pour audit.
- **Reconnexion** : `matchId` en `sessionStorage` ; à la reco, `resync` renvoie
  l'état courant + `deadlineMs`.

### Livrables

- `server/` (Bun + `ws`) : file d'attente, orchestrateur de matchs, endpoint santé.
- `src/net/client.ts` : wrapper WS + file d'événements consommée par `match.ts`.
- `match.ts` : nouveau mode `sides: ["human", "remote"]`.
- `docker-compose.yml` local : un conteneur serveur.
- Test : deux clients simulés (Node) jouent 20 tours, hash identiques à chaque tour.

---

## Phase 4 — Comptes + matchmaking + file non classée 🟡

**Objectif** : identité persistante et mise en relation par niveau caché.

**Fait — version locale (`src/lib/profile.ts`, sans PocketBase)**

- Profil unique en `localStorage` : pseudo, XP de compte + courbe de niveau,
  compteurs V/D, série, historique des 40 derniers matchs.
- Note cachée Glicko-2 (`src/lib/glicko2.ts`) qui ne bouge que sur les parties
  « classables » — pour l'instant vs bot, chaque niveau de bot servant d'ancre de
  note fixe (Souple ≈ 1150, Correct ≈ 1500, Coriace ≈ 1850). Palier affiché après
  5 parties classables.
- Écrans DOM : saisie du pseudo au 1er lancement, pastille de profil au menu,
  écran profil (stats + historique + renommer + réinitialiser), bloc de
  progression sur l'écran de résultat (XP gagnée, delta de note, montée de niveau).
- 11 tests Vitest (`src/lib/profile.test.ts`).
- Le jour où PocketBase est branché, ce module devient le cache local du
  profil serveur.

**Fait (hors infra, testé en local — 2026-09-11, voir `pocketbase/README.md`)**

Le projet utilise **PocketBase** (SQLite + Auth + hooks JS, un seul binaire
auto-hébergé sur le VPS) plutôt que Supabase — choix délibéré pour
s'auto-héberger entièrement sur l'infra déjà prévue (VPS + Coolify), sans
dépendre d'une plateforme tierce. Les migrations, routes et règles d'accès ont
été **appliquées et appelées pour de vrai** contre une instance PocketBase
locale (v0.40.3) pendant le développement — pas seulement écrites :

- `pocketbase/pb_migrations/1757581200_core.js` — étend la collection `users`
  intégrée (pseudo déjà natif, + `account_xp`, `country`), collections
  `ratings` et `matches`. Écriture réservée au superuser (équivalent service
  role) ; lecture publique.
- `pocketbase/pb_hooks/settle-match.pb.js` — route `POST /api/settle-match` :
  insère `matches` (rejouable via `order_log`), et si `ranked` recalcule
  Glicko-2 et l'applique atomiquement (`$app.runInTransaction`). Glicko-2
  dupliqué en JS pur (goja n'importe pas les modules TS du dépôt), à garder
  synchro avec `src/lib/glicko2.ts`. Protégée par un secret partagé
  (`X-Settle-Secret`).
- `pocketbase/Dockerfile` — télécharge le binaire PocketBase, embarque
  migrations + hooks ; build et conteneur testés (`docker build` + `docker run`
  + requêtes réelles).
- `.env.example` mis à jour (`POCKETBASE_URL`, `MATCH_SETTLE_SECRET`).

**Reste (avec toi)** : écran connexion/profil, `src/net/session.ts` (JWT
PocketBase + refresh, SDK JS officiel), le serveur de match qui vérifie le JWT
à la connexion WS et appelle `settle-match` en fin de partie, matchmaking par
fenêtre de note (`±(60 + 12·s)` d'attente) dans `server/server.ts`.

### PocketBase — collections (migrations dans `pocketbase/pb_migrations/`)

`users` est la collection auth intégrée de PocketBase (pseudo, email, mot de
passe déjà gérés) — pas de table `profiles` séparée comme en SQL, juste des
champs en plus (`account_xp`, `country`). `ratings` et `matches` sont des
collections PocketBase classiques :

```js
// ratings — une ligne par utilisateur, notation Glicko-2 courante
{ user: relation(users, unique), mu: number, phi: number, sigma: number, games: number }

// matches — source de vérité, rejouable via order_log
{
  mode: select("unranked"|"ranked"), season: relation(seasons)?,
  arena: text, seat0: relation(users)?, seat1: relation(users)?,
  team0: json, team1: json,               // [HeroKind, HeroKind, HeroKind]
  winner: number?, hold0: number, hold1: number, turns: number,
  order_log: json,                        // [[OrderA, OrderB], ...] -> rejouable
  ended: date,
}
```

- **Règles d'accès** (équivalent des RLS Supabase) : `listRule`/`viewRule = ""`
  (lecture publique) sur `ratings` et `matches` ; `createRule`/`updateRule` =
  `null` (personne, même authentifié — **écrit uniquement par le superuser**,
  celui que le serveur de match utilise, jamais par un client).
- **Auth** : Auth PocketBase (email/mot de passe natif, OAuth configurable
  depuis le dashboard admin). Le client obtient un JWT PocketBase ; le serveur
  de match le vérifie à la connexion WS et attache l'id utilisateur au siège.
- **Piège trouvé en testant** : ne jamais `required: true` sur un champ nombre
  qui peut légitimement valoir 0 (XP de départ, compteur de parties…) —
  PocketBase traite 0 comme « vide » et rejette l'écriture. Voir les
  commentaires dans les fichiers de migration.

### Matchmaking

- Service dans le serveur Bun : file ordonnée par `mu`, fenêtre d'acceptation qui
  s'élargit avec l'attente (`±(60 + 12·secondes)`).
- Anti-abandon : un `over` par forfait compte comme défaite (Phase 5).

### Livrables

- Écran connexion / profil (choix du pseudo).
- `src/net/session.ts` : gestion du JWT PocketBase, refresh.
- File non classée fonctionnelle bout en bout.
- Le serveur de match appelle `POST /api/settle-match` en fin de partie
  (fait, `pocketbase/pb_hooks/settle-match.pb.js` — reste à brancher l'appel
  côté `server/server.ts`).

---

## Phase 5 — Classé Glicko-2 + saisons 🟡

**Objectif** : un ladder juste, avec des saisons.

**Fait (hors infra)**

- `src/lib/glicko2.ts` — algorithme complet (variance, Δ, volatilité par
  Illinois, φ'/μ'), `settle1v1`, `decay`, `tierOf`, `softReset`.
- `src/lib/glicko2.test.ts` — **reproduit l'exemple de référence de Glickman**
  (1464,06 / 151,52 / 0,05999), + convergence compte neuf, decay plafonné,
  paliers ordonnés.
- `pocketbase/pb_migrations/1757581260_ranked.js` — collections `seasons`,
  `season_ratings` (avec `peak_rating`, `placement_left`), lien
  `matches.season`. Le règlement atomique (ex-RPC `settle_ranked_match`) vit
  dans `settle-match.pb.js` ; la bascule de saison (ex-RPC `rollover_season`)
  dans `pocketbase/pb_hooks/rollover-season.pb.js` (route
  `POST /api/rollover-season`, soft reset). **Les deux testés pour de vrai**
  contre une instance PocketBase locale : match classé réglé, notes symétriques
  correctes (Glicko-2 vérifié), bascule de saison avec soft reset appliqué.

**Reste (avec toi)** : écran de rang + jauge de palier, leaderboard Élite (top 500),
brancher `settle-match` en mode `ranked`, cron de bascule de saison.

### Glicko-2 (τ = 0.5, échelle interne)

Après chaque match classé, pour chaque joueur (adversaire `j`) :

```
g(φ)      = 1 / sqrt(1 + 3φ²/π²)
E(μ,μj,φj)= 1 / (1 + exp(-g(φj)·(μ-μj)))
v         = [ g(φj)² · E · (1-E) ]⁻¹
Δ         = v · g(φj) · (s - E)                 // s ∈ {1, 0.5, 0}
σ'        = résolu par itération (algo de Glickman, τ)
φ*        = sqrt(φ² + σ'²)
φ'        = 1 / sqrt(1/φ*² + 1/v)
μ'        = μ + φ'² · g(φj) · (s - E)
```

Conversion d'affichage : `rating = 1500 + 173.7178·μ_glicko`. Inactif : `φ`
regrandit dans le temps (`φ* = sqrt(φ² + σ²·Δjours)`), plafonné à 350.

### Règles

- **Placement** : 10 matchs, `σ` de départ élevé → convergence rapide (anti-smurf).
- **Paliers affichés** : Bronze < Argent < Or < Platine < Diamant < Master, puis
  **Élite** = top 500 au `rating`, ladder nominatif.
- **Saison = 8 semaines**. Soft reset : `μ' = μ·0.6 + 1500·0.4`, `φ` remis à 200.
- **Récompenses attribuées sur le pic de `rating` de la saison**, pas la valeur
  finale. Cosmétiques uniquement.
- **Decay** : Diamant+ seulement, après 7 jours d'inactivité.

### Schéma

```sql
create table seasons (
  id          serial primary key,
  name        text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null
);
create table season_ratings (
  season_id   integer references seasons(id),
  profile_id  uuid references profiles(id),
  mu double precision, phi double precision, sigma double precision,
  peak_rating integer not null default 0,
  games integer not null default 0,
  primary key (season_id, profile_id)
);
```

- Edge Function `settle-match` : recalcule Glicko-2 des deux joueurs dans une
  transaction, met à jour `season_ratings.peak_rating`.
- Cron (pg_cron ou routine Coolify) : bascule de saison, distribution des
  récompenses, archivage du ladder.

### Livrables

- `src/lib/glicko2.ts` + tests unitaires contre les exemples de référence de Glickman.
- Écran classé : rang, jauge vers le palier suivant, historique.
- Leaderboard Élite.

---

## Phase 6 — Draft, roster complet, replays, spectate ✅

**Fait**

- **Replays** — `src/game/replay.ts` (enregistrement, sérialisation JSON,
  téléchargement/lecture de fichier) + `src/game/replay-player.ts` (lecteur
  déterministe : reconstruit tous les tours depuis `newMatch(setup)` + le log
  d'ordres, lecture/pause à l'Espace, ← → pour naviguer par tour). Le protocole
  réseau renvoie `ordersPlayed` pour que les matchs en ligne soient aussi
  enregistrables. Fichier = quelques Ko.

- **Ban/pick local** — `banPickScreen()` (`src/game/ui.ts`) pour bot + hotseat :
  chaque camp bannit 1 héros du pool commun, puis compose 3 héros parmi les
  restants (compos autorisées à se recouper). Le bot bannit et compose au hasard.

- **Ban/pick en ligne (fait 2026-09-11)** — même principe, piloté par le
  serveur : `Draft` (`server/server.ts`) s'intercale entre l'appariement et le
  début du match — ban simultané (`DRAFT_BAN_MS` = 15 s), puis pick simultané
  parmi les restants (`DRAFT_PICK_MS` = 25 s), choix aléatoire pour qui dépasse
  le délai (même filet de sécurité que le bot en local). Nouveaux messages
  protocole (`src/net/protocol.ts`) : `paired`, `draft` (serveur → client),
  `ban`/`pick` (client → serveur) ; `QueueSetup` ne porte plus de `team`, la
  compo vient désormais de la draft. Côté client, `onlineDraftScreen()`
  (`src/game/ui.ts`) affiche la phase courante et se fige sur « en attente de
  l'adversaire » une fois le choix envoyé. `scripts/net-test.ts` simule aussi
  le flux (bannit/prend automatiquement) pour l'intégration serveur↔résolveur.

**Roster à 8 (fait 2026-09-11)** : 2 héros de plus dans `heroes.ts`/`solver.ts`,
disponibles partout via `ROSTER` (draft, codex, ban/pick — aucun autre écran à
toucher) :

- **Vex** (mage) — charge courte puis _Effondrement_ : ouvre une faille qui
  tire tous les ennemis proches vers elle au lieu de les repousser (inverse de
  Quake/Éclat). Passive _Ancrage_ : +40 % de traction si elle n'a pas agi au
  tour précédent (même mécanique que l'Affût de Sling, appliquée à la
  traction). `sinkhole()` dans `solver.ts`.
- **Arc** (sniper) — tir lent qui éclabousse à l'impact : en plus de la cible
  touchée, pousse plus faiblement les ennemis proches du point d'impact
  (`splashRadius` sur `Projectile`, `splashHit()` dans `solver.ts`).
  _Fragmentation_ élargit ce rayon d'éclat.

Testé : 2 tests dédiés dans `solver.test.ts` (traction de Vex, éclat d'Arc),
`scripts/check.ts` exerce désormais Vex + Arc dans son match bot vs bot.

**Spectate (fait 2026-09-11)** — le serveur tient un registre des matchs en
cours (`liveMatches`, `server/server.ts`) ; un client peut demander
`listMatches` (renvoie id/arène/tour de chaque match live) puis `spectate` un
`matchId` — il rejoint `Match.observers`, reçoit l'état courant (`spectating`)
puis chaque `turn` diffusé aux deux joueurs (lecture seule, jamais d'`Order`
accepté d'un observateur). Côté client, `SpectateView`
(`src/game/spectate-view.ts`) anime les tours au fil de l'eau — même moteur de
lecture que `ReplayPlayer`, mais alimenté par le réseau plutôt qu'un log figé.
Écran `spectateListScreen()` (`src/game/ui.ts`) pour choisir un match, accessible
depuis le menu (« Regarder un match en direct »).

**Bug corrigé au passage** : `ReplayPlayer` et `SpectateView` référençaient un
id DOM `abilityWrap` qui n'existe plus depuis le passage à la barre d'action
(`#actionbar`) en P2 — `document.getElementById` renvoyait `null`, crash au
lancement d'un replay ou d'un spectate. Trouvé en testant le spectate en
conditions réelles (2 joueurs + 1 spectateur, navigateur), corrigé dans les
deux fichiers.

**Reste (hors scope P6, idée future)** : défis d'amis, lobbies privés (code de
salle).

---

## Phase 7 — Pass de saison, cosmétiques, déploiement 🟡

**Fait** : `pocketbase/pb_migrations/1757581320_cosmetics.js` (`cosmetics`,
`ownership`, `battlepass_progress`), XP de pass + déblocage géré dans
`settle-match.pb.js` (`grantBattlepassXp`) — **testé pour de vrai** (un match
classé accorde bien 120 XP de pass, débloque les cosmétiques `battlepass_free`
au palier franchi). `Dockerfile` (cibles `web`/`match`) + `pocketbase/Dockerfile`
(build et conteneur testés), `docker-compose.yml` (3 services), `docs/DEPLOY.md`
(runbook complet).
**Reste** : contenu (table palier→cosmétique précise), UI vestiaire/pass,
déploiement réel sur le VPS.

### Cosmétiques (intégrité compétitive : zéro `power` à vendre)

```js
// cosmetics — slug stable (référencé par le contenu), pas l'id PocketBase interne
{ slug: text(unique), kind: select("hero_skin"|"arena_skin"|"border"|"title"),
  name: text, rarity: select("common"|"rare"|"epic"|"seasonal"),
  source: select("battlepass_free"|"battlepass_premium"|"rank_reward"|"shop") }

// ownership — qui possède quoi
{ user: relation(users), cosmetic: relation(cosmetics), acquired: autodate }

// battlepass_progress — progression de saison par joueur
{ season: relation(seasons), user: relation(users), tier: number, xp: number, premium: bool }
```

- XP de pass gagné en jouant (tout mode). Palier = récompense (piste gratuite +
  premium). Achat premium : hors périmètre paiement pour l'instant (flag manuel).

### Déploiement (Coolify sur le VPS)

- Conteneur **web** : build Vite statique servi par un nginx/caddy.
- Conteneur **serveur de match** (Node) : WS + matchmaking. Scalable
  horizontalement plus tard — le matchmaker assigne un match à une instance.
- Conteneur **pocketbase** (`pocketbase/Dockerfile`) : SQLite + Auth, image
  buildée et testée en local (voir `pocketbase/README.md`). Volume `pb_data` à
  sauvegarder régulièrement — pas de réplication managée comme Supabase, c'est
  nous qui en sommes responsables.
- Santé : `/healthz` sur le serveur de match, `/api/health` sur PocketBase ;
  logs structurés (un objet JSON par tour côté match).
- **Anti-triche en prod** : rate-limit par IP/JWT sur `queue` et `order` ;
  détection d'anomalies de winrate/temps de réponse en tâche de fond ; tout match
  rejouable depuis `order_log`.

### Definition of done spécifique prod

- `docker compose up` en local reproduit la topo.
- Un runbook `docs/DEPLOY.md` : variables d'env, ordre de démarrage, rollback.
- Bascule de saison testée sur une saison courte (24 h) en staging.
