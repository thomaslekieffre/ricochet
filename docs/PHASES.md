# Ricochet — les phases

Plan de référence. Chaque phase a un **objectif unique**, un périmètre fermé, et
une definition of done (voir `CLAUDE.md` § « recette »). On ne commence une phase
que quand la précédente est verte.

| # | Phase | État |
|---|---|---|
| 1 | Le choc — solveur de knockback déterministe | ✅ Fait |
| 2 | Le jeu complet en local — mode Contrôle, 6 héros, 3 arènes, bot, hotseat | ✅ Fait |
| 3 | Serveur autoritatif — 1v1 en ligne, sans compte | ✅ Fait |
| 4 | Comptes + matchmaking + file non classée | ✅ Fait — profil local, serveur ↔ PocketBase, écran connexion/compte, matchmaking par note, tous testés en vrai |
| 5 | Classé Glicko-2 + saisons | 🟡 Partiel — `glicko2.ts` fait + testé, matchmaking par note + bascule `ranked` fait et testé, note cachée locale vs bot faite, migrations écrites ; reste à seeder une saison active pour vérifier la mise à jour Glicko-2 en vrai |
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

**Rendu passé sur PixiJS (fait 2026-09-11)** — décidé après une discussion sur
Rust+React : pas de réécriture du moteur (déterminisme déjà résolu et testé)
ni de l'UI (React prématuré), mais le rendu Canvas 2D ne pouvait pas porter
de vraies animations. `src/game/renderer.ts` réécrit intégralement sur
`pixi.js@7.4.3` (API `Graphics` classique, `Application({view: canvas})` pour
réutiliser `#stage` sans async) — seule dépendance runtime du projet,
documentée dans `CLAUDE.md`. Signature publique inchangée (`Renderer`,
`draw()`, `toWorld()`, `VIEW_W`/`VIEW_H`) donc `match.ts`/`replay-player.ts`/
`spectate-view.ts` n'ont besoin que d'un `this.r.dispose()` en plus dans leur
`dispose()` (contexte WebGL à libérer, contrairement au Canvas 2D).

Ce que ça change concrètement, sans toucher au solveur :
- **silhouettes par archétype** (octogone brawler, losange dasher, hexagone
  sniper, étoile mage) au lieu d'un disque + lettre uniforme — le glyphe reste
  affiché par-dessus pour la lisibilité ;
- **squash & stretch** réel sur choc (détecté en comparant la vitesse d'un
  héros d'une frame à l'autre — un corps qui décélère brutalement a été
  touché), pas juste un flash ;
- **particules de débris** au choc et au KO ;
- **traînées** sur les héros dashers en pleine charge (en plus des traînées de
  projectile déjà existantes) ;
- ombres portées, glow des capacités/du Momentum, screen shake via la position
  du root container plutôt que `ctx.translate`.

Testé en vrai dans le navigateur (`npm run dev`, match bot vs bot joué à la
main) : formes, glow, bascule de contrôle de zone, knockback tous corrects,
zéro erreur console. `npx tsc --noEmit`, `npm test`, `npm run check`, `npm run
build` tous verts après le changement.

**Coût mesuré** : bundle JS principal 573 KB (181 KB gzip), contre largement
moins avant PixiJS — pas encore code-splitté (`vite build` avertit sur la
taille du chunk). À réduire plus tard si besoin (dynamic import, manualChunks)
mais pas bloquant pour le dev local.

**Sprites par héros (fait 2026-09-11)** — `src/assets/heroes/*.png` (8
fichiers, ~850 Ko au total, premiers assets binaires du projet). Le MCP
claude.ai (Higgsfield, `generate_image`) reste bloqué par le plan du compte
(« Requires basic plan or higher ») ; généré à la place via **FLUX.1 [schnell]
sur un Space Hugging Face** (gratuit, compte HF gratuit requis pour dépasser
le quota invité de 2 générations), un par un dans Chrome, téléchargés puis
détourés en local (`scripts/process-hero-sprites.mjs`, `sharp` en
devDependency) : flood fill depuis les bords de l'image plutôt qu'une clé
chroma globale, pour ne pas créer de trous dans les zones blanches internes
(visages, surbrillances) des héros au trait fin (Sling, Arc). Un premier essai
avec **Pollinations.ai** (encore plus libre d'accès, aucune inscription) a été
abandonné : style et cadrage pas assez fiables d'une génération à l'autre
(vignettage, piédestal de figurine, fond non uniforme malgré des prompts
répétés) pour un pipeline de 8 sprites cohérents.

Intégration dans `renderer.ts` : chaque héros garde ses couleurs propres (un
rendu sombre ne se teinte pas de façon lisible par `sprite.tint`) ; le camp
(vert/rose) se lit maintenant sur un **socle aplati** sous les pieds (silhouette
d'archétype existante — octogone/losange/hexagone/étoile — réutilisée en
plaque plutôt qu'en remplissage plein) + le halo déjà existant. Le glyphe
central (lettre) est réduit et déplacé en badge coin bas-droite, redondant
avec l'art mais gardé pour une identification rapide. Testé en vrai
(`npm run dev`, bot vs bot, les deux camps) : sprites visibles, socles de camp
lisibles, zéro erreur console. `npx tsc --noEmit`, `npm test`, `npm run check`,
`npm run build` tous verts.

**Reste dans P2 (polish, pas bloquant)** : animations (les sprites sont des
poses statiques, le squash/stretch/glow procédural s'applique par-dessus) ;
équilibrage réel des 8 héros par des parties ; code-splitting du bundle si sa
taille devient gênante ; qualité visuelle inégale entre héros (Boulder/Ram en
rendu « figurine » plein, Sling/Arc en trait fin plus sobre) — pas retouché,
pas bloquant pour la lisibilité en jeu.

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

**Branchement serveur ↔ PocketBase (fait 2026-09-11)** — `src/net/session.ts` :
auth PocketBase côté navigateur en `fetch` brut (pas le SDK JS officiel — zéro
dépendance runtime, voir CLAUDE.md), register/login/logout/refresh, JWT +
profil persistés en `localStorage`. `QueueSetup.token` transporte ce JWT ;
`server/server.ts` le vérifie via `POST /auth-refresh` à la connexion
(`verifyToken`, best-effort — un token absent/invalide = invité, jamais
d'erreur bloquante). Chaque match en ligne terminé (victoire réelle **ou**
forfait par déconnexion) appelle `POST /api/settle-match` avec l'`order_log`
complet et les deux `seat` (userId PocketBase ou `null` si invité). Mode
envoyé : `"unranked"` pour l'instant — le classé (P5) attend le matchmaking
par note ci-dessous.

**Testé en vrai** (pas seulement lu) : instance PocketBase locale démarrée
(`.pb-bin/pocketbase.exe`, non commité — binaire téléchargé en local),
compte créé via l'API REST, un match complet bot vs bot joué de bout en bout
à travers deux clients WebSocket réels jusqu'à une vraie victoire (8-15, tour
53) : la ligne `matches` apparaît avec `seat0` = l'id du compte, l'`order_log`
complet (53 tours), et `account_xp` du compte passe de 0 à 80. `npm test`,
`npm run check`, `npm run net-test` (sans PocketBase branché — le serveur
reste fonctionnel sans backend, `settleMatch` devient un no-op silencieux)
tous verts après le changement.

**Bug trouvé en testant** : `matches.order_log` était `required: true` —
PocketBase traite un tableau JSON vide `[]` comme "vide", donc un forfait au
tour 0 (avant qu'un seul `Order` soit envoyé) faisait échouer `settle-match`.
Même piège que les `NumberField` à 0 déjà documenté, cette fois sur un
`JSONField`. Corrigé par une nouvelle migration
(`1757581400_fix_order_log_required.js`), pas en éditant la migration déjà
appliquée.

**Écran connexion/compte (fait 2026-09-11)** — `ui.ts` (`accountScreen`) +
`app.ts` (`showAccount`) : login / inscription / déconnexion contre
`session.ts`, accessible depuis l'écran profil (bouton « Compte PocketBase »,
avec la ligne d'état connecté/invité). Le token PocketBase est envoyé dans
`QueueSetup.token` à la mise en file en ligne ; `Session.refresh()` est
rappelé au lancement de l'app et après chaque match en ligne pour resynchroniser
l'XP de compte écrite par `settle-match`. Testé en vrai dans le navigateur
(`npm run dev`, sans instance PocketBase active) : validation des champs,
erreur réseau traduite proprement (« Serveur de comptes injoignable — réessaie
plus tard. » plutôt que le `Failed to fetch` brut), bascule login/inscription,
retour à l'écran profil. Pas encore testé avec une instance PocketBase réelle
en local (le login/l'inscription réels restent à valider en conditions
réelles).

**Reste (avec toi)** : matchmaking par fenêtre de note (`±(60 + 12·s)`
d'attente) dans `server/server.ts`, bascule vers `mode: "ranked"` une fois ce
matchmaking en place.

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

### Matchmaking (fait 2026-09-11)

`server/server.ts` — file ordonnée par note affichée (`toDisplay(rating)`,
échelle 1500 ± 173.7·mu, `src/lib/glicko2.ts`), fenêtre d'acceptation qui
s'élargit avec l'attente (`±(60 + 12·secondes)`) : `matchRanked()` cherche,
pour le compte qui attend depuis le plus longtemps, l'adversaire classé dispo
le plus proche en note dans la fenêtre courante ; un `setInterval` (2 s) fait
grandir la fenêtre même sans nouvel événement de file. `fetchRating()` lit
`ratings` (lecture publique côté PocketBase, pas besoin du JWT du joueur) —
pas de ligne == jamais classé == note de départ 1500, même valeur que
`ratingOrDefault` côté `settle-match.pb.js`.

**Jouer sans compte reste toujours immédiat** : un invité (`ratingDisplay ===
null`) absorbe le premier venu dans `matchFifoFallback()`, classé ou non, sans
jamais attendre derrière la file par note. Un compte classé qui ne trouve pas
d'adversaire proche retombe en non classé après `RANKED_FALLBACK_MS` (45 s)
face à un autre compte classé dans le même cas — pour ne jamais rester bloqué
si trop peu de joueurs classés sont en ligne. `Match` porte désormais son
`mode` ("ranked"/"unranked") jusqu'à `settle()`, qui ne classe que si les deux
sièges sont des comptes identifiés (`p.mode` remplace la valeur `"unranked"`
jusque-là codée en dur dans `settleMatch()`).

Testé en vrai (`POCKETBASE_URL` sur une instance locale, deux comptes créés) :
classé-vs-classé s'apparie en ~90 ms (même note par défaut, diff 0 ≤ fenêtre),
classé-vs-invité et invité-vs-invité en ~15 ms — l'invité n'attend jamais.
`npm test`, `npm run check`, `npm run net-test`, `npm run build` tous verts
après le changement (le `net-test` deux-invités confirme la non-régression du
chemin non classé d'origine).

**Reste** : aucune `seasons` (`active: true`) n'existe encore en local ni en
prod (P7, pas encore seedée) — un match `mode: "ranked"` s'enregistre
correctement dans `matches`, mais `settle-match.pb.js` n'applique la mise à
jour Glicko-2 (`ratings`/`season_ratings`) que si une saison active est
trouvée ; donc pas encore vérifié en vrai que la note bouge après un match
classé, seul le matchmaking lui-même (l'appariement) l'a été. Anti-abandon
(un `over` par forfait compte comme défaite) déjà géré par `onLeave()` côté
`Match`, hérité de P3/P4 — rien à ajouter pour P5.

### Livrables

- Écran connexion / profil (choix du pseudo). ✅
- `src/net/session.ts` : gestion du JWT PocketBase, refresh. ✅
- File non classée fonctionnelle bout en bout. ✅
- Matchmaking par note + bascule `mode: "ranked"`. ✅ (reste à vérifier la
  mise à jour Glicko-2 en vrai une fois une saison active seedée, P7)
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
