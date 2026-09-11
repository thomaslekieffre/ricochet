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
| 6 | Draft ban/pick + roster complet + replays + spectate | 🟡 Partiel — **replays + ban/pick local faits** |
| 7 | Pass de saison + cosmétiques + déploiement | 🟡 Partiel — migrations + `DEPLOY.md` + Docker |

Légende : 🟡 = la partie qui ne touche pas Supabase/VPS est faite et testée ; le
reste attend les credentials et se fait avec toi.

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

**Reste à faire dans P2 (polish, pas bloquant)** : sortir le bot dans un Web
Worker (aujourd'hui ~250 ms de calcul synchrone au niveau 2, différés d'un tick) ;
passer le rendu sur PixiJS si le Canvas 2D montre ses limites ; équilibrage réel
des 6 héros par des parties.

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

**Fait — version locale (`src/lib/profile.ts`, sans Supabase)**

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
- Le jour où Supabase est branché, ce module devient le cache local du profil
  serveur.

**Fait (hors infra)**

- `supabase/migrations/0001_core.sql` — `profiles`, `ratings`, `matches` + RLS
  (lecture publique, écritures ratings/matches réservées au service role) +
  trigger `profile_created` + `bump_account_xp`.
- `supabase/functions/settle-match/index.ts` — insère la ligne `matches`
  (rejouable via `order_log`), et si `ranked` recalcule Glicko-2 et appelle le
  RPC. Glicko-2 inline, à garder synchro avec `src/lib/glicko2.ts`.
- `.env.example`.

**Reste (avec toi, besoin Supabase)** : écran connexion/profil, `src/net/session.ts`
(JWT + refresh), le serveur de match qui vérifie le JWT à la connexion WS et
appelle `settle-match` en fin de partie, matchmaking par fenêtre de note
(`±(60 + 12·s)` d'attente) dans `server/server.ts`.

### Supabase — schéma (migrations dans `supabase/migrations/`)

```sql
-- profils (1-1 avec auth.users)
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  username     text unique not null check (char_length(username) between 3 and 16),
  created_at   timestamptz not null default now(),
  account_xp   integer not null default 0,
  country      text
);

-- notation cachée (une ligne par joueur, mise à jour Phase 5)
create table ratings (
  profile_id   uuid primary key references profiles on delete cascade,
  mu           double precision not null default 1500,   -- Glicko-2
  phi          double precision not null default 350,
  sigma        double precision not null default 0.06,
  games        integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- matchs joués (source de vérité pour audit + replay)
create table matches (
  id           uuid primary key default gen_random_uuid(),
  mode         text not null,            -- 'unranked' | 'ranked'
  season_id    integer references seasons(id),
  arena        text not null,
  seat0        uuid references profiles,
  seat1        uuid references profiles,
  team0        text[] not null,
  team1        text[] not null,
  winner       smallint,                 -- 0 | 1 | null
  hold0        integer, hold1 integer,
  turns        integer,
  order_log    jsonb not null,           -- [[OrderA, OrderB], ...] -> rejouable
  created_at   timestamptz not null default now(),
  ended_at     timestamptz
);
```

- **RLS** : `profiles` lisible par tous, modifiable par son propriétaire.
  `ratings` lisible par tous, **écrit uniquement par une Edge Function**
  `settle-match` (service role) — jamais par le client.
- **Auth** : Supabase Auth (e-mail + OAuth Google/Discord). Le client obtient un
  JWT ; le serveur de match le vérifie (`supabase.auth.getUser(jwt)`) à la
  connexion WS et attache `profile_id` au siège.

### Matchmaking

- Service dans le serveur Bun : file ordonnée par `mu`, fenêtre d'acceptation qui
  s'élargit avec l'attente (`±(60 + 12·secondes)`).
- Anti-abandon : un `over` par forfait compte comme défaite (Phase 5).

### Livrables

- Écran connexion / profil (choix du pseudo).
- `src/net/session.ts` : gestion du JWT, refresh.
- File non classée fonctionnelle bout en bout.
- Edge Function `record-match` : insère la ligne `matches` en fin de partie.

---

## Phase 5 — Classé Glicko-2 + saisons 🟡

**Objectif** : un ladder juste, avec des saisons.

**Fait (hors infra)**

- `src/lib/glicko2.ts` — algorithme complet (variance, Δ, volatilité par
  Illinois, φ'/μ'), `settle1v1`, `decay`, `tierOf`, `softReset`.
- `src/lib/glicko2.test.ts` — **reproduit l'exemple de référence de Glickman**
  (1464,06 / 151,52 / 0,05999), + convergence compte neuf, decay plafonné,
  paliers ordonnés.
- `supabase/migrations/0002_ranked.sql` — `seasons`, `season_ratings` (avec
  `peak_rating`, `placement_left`), RPC `settle_ranked_match` (application
  atomique + pic), RPC `rollover_season` (soft reset).

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

## Phase 6 — Draft, roster complet, replays, spectate 🟡

**Fait**

- **Replays** — `src/game/replay.ts` (enregistrement, sérialisation JSON,
  téléchargement/lecture de fichier) + `src/game/replay-player.ts` (lecteur
  déterministe : reconstruit tous les tours depuis `newMatch(setup)` + le log
  d'ordres, lecture/pause à l'Espace, ← → pour naviguer par tour). Le protocole
  réseau renvoie `ordersPlayed` pour que les matchs en ligne soient aussi
  enregistrables. Fichier = quelques Ko.

- **Ban/pick local** — `banPickScreen()` (`src/game/ui.ts`) pour bot + hotseat :
  chaque camp bannit 1 héros du pool commun, puis compose 3 héros parmi les 4
  restants (compos autorisées à se recouper). Le bot bannit et compose au hasard.
  Le mode « En ligne » garde le draft simple (pas de ban) tant que le serveur ne
  gère pas la phase.

**Reste**

- **Ban/pick en ligne** : phase `draft` dans le serveur avant `turn 1`, UI temps réel.
- **Roster à 8** : 2 héros (implémentation de leurs capacités dans `solver.ts`).
- **Spectate** : le serveur diffuse les `turn` d'un match à des sockets observateurs.
- Défis d'amis, lobbies privés (code de salle).

---

## Phase 7 — Pass de saison, cosmétiques, déploiement 🟡

**Fait** : `supabase/migrations/0003_cosmetics.sql` (`cosmetics`, `ownership`,
`battlepass_progress` + RPC `grant_battlepass_xp`), `Dockerfile` (cibles `web` /
`match`), `docker-compose.yml`, `docs/DEPLOY.md` (runbook complet).
**Reste** : contenu (table palier→cosmétique), UI vestiaire/pass, déploiement réel
sur le VPS.


### Cosmétiques (intégrité compétitive : zéro `power` à vendre)

```sql
create table cosmetics (
  id text primary key, kind text not null,       -- 'hero_skin'|'arena_skin'|'border'|'title'
  name text not null, rarity text not null, source text not null
);
create table ownership (
  profile_id uuid references profiles(id),
  cosmetic_id text references cosmetics(id),
  acquired_at timestamptz not null default now(),
  primary key (profile_id, cosmetic_id)
);
create table battlepass_progress (
  season_id integer references seasons(id),
  profile_id uuid references profiles(id),
  tier integer not null default 0,
  xp integer not null default 0,
  premium boolean not null default false,
  primary key (season_id, profile_id)
);
```

- XP de pass gagné en jouant (tout mode). Palier = récompense (piste gratuite +
  premium). Achat premium : hors périmètre paiement pour l'instant (flag manuel).

### Déploiement (Coolify sur le VPS)

- Conteneur **web** : build Vite statique servi par un nginx/caddy.
- Conteneur **serveur de match** (Bun) : WS + matchmaking. Scalable
  horizontalement plus tard — le matchmaker assigne un match à une instance.
- **Supabase** : instance existante (voir `~/.claude/.../memory/infra.md`).
  Migrations via `supabase db push`.
- Santé : `/healthz` sur le serveur ; logs structurés (un objet JSON par tour).
- **Anti-triche en prod** : rate-limit par IP/JWT sur `queue` et `order` ;
  détection d'anomalies de winrate/temps de réponse en tâche de fond ; tout match
  rejouable depuis `order_log`.

### Definition of done spécifique prod

- `docker compose up` en local reproduit la topo.
- Un runbook `docs/DEPLOY.md` : variables d'env, ordre de démarrage, rollback.
- Bascule de saison testée sur une saison courte (24 h) en staging.
