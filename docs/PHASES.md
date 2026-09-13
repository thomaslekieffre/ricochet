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
| 5 | Classé Glicko-2 + saisons | 🟡 Partiel — logique bout en bout vérifiée en vrai (saison active, appariement, mise à jour Glicko-2) ; reste l'UI (écran de rang, leaderboard) et le déploiement réel |
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

**Lisibilité des chocs/KO (fait 2026-09-11)** — retour de Zoe après avoir
joué : « des fois on a un peu de mal à comprendre pourquoi c'est mon bonhomme
qui se fait éjecter ». En 3v3 à résolution simultanée, plusieurs chocs
peuvent arriver d'un coup, difficile de voir qui vient de se faire toucher.
`renderer.ts` : nouveau `renderImpacts()` + layer `impactG`, alimenté par les
deux points de détection déjà existants dans `syncBody` (chute brutale de
vitesse = choc ; transition alive→false = KO) — un anneau qui s'agrandit et
s'efface (blanc + double anneau pour un KO, couleur de camp sinon) marque net
l'endroit et l'instant. Aucune dépendance à de nouvelles données du solveur
(tout vient des positions déjà reçues frame par frame), donc zéro risque pour
le déterminisme. `npx tsc --noEmit`, `npm test`, `npm run check` verts ;
vérifié en vrai en jouant plusieurs tours (bot vs bot, Coriace) — les bases de
camp (vert/rose) sous les sprites, ajoutées avec les sprites eux-mêmes plus
tôt dans la journée, confirmées lisibles même quand les deux camps partagent
le même héros (ex. Boulder vs Boulder, non banni des deux côtés).

**Animations par héros — chantier démarré, en pause sur quota (2026-09-11)** :
prochain gros chantier voté avec Zoe, en vraies frames dessinées (pas de
l'animation procédurale) plutôt que le flash de choc ci-dessus, qui reste un
pis-aller. Approche retenue : 2 héros d'abord pour valider tout le pipeline
(génération → détourage → intégration), **Boulder** (brawler, silhouette
simple) et **Comet** (dasher, contraste de style), avec pour chacun une pose
« touché » (flinch/recul) et une pose « KO » en plus de la pose existante qui
sert d'idle — donc 4 générations. **Bloqué immédiatement** : le quota ZeroGPU
gratuit du compte HF créé plus tôt dans la journée (cf. section sprites
ci-dessus) était déjà déchargé par les 6 sprites générés ce jour-là ; premier
essai de pose « touché » pour Boulder → « You've hit your daily ZeroGPU
limit », reset quotidien (pas d'heure précise donnée par HF, probablement
minuit UTC). **Rien généré, rien intégré côté animations** — seul le flash de
choc procédural (section précédente) est en prod. Repartir de : le prompt
Boulder « touché » ci-dessous, à relancer sur
`https://huggingface.co/spaces/black-forest-labs/FLUX.1-schnell` (compte HF
gratuit déjà créé par Zoe) une fois le quota revenu :

> flat 2D vector game icon, full body massive heavy brawler character
> flinching backward from a hit, octagonal broad armored body, leaning back
> off balance, one arm raised defensively, bold thick black outline, single
> flat solid light grey silhouette fill, no shading, no gradient, no 3D
> render, minimalist esports mascot style, plain solid pure white background,
> centered, no text

Intégration technique prévue côté `renderer.ts` une fois les fichiers en
main : étendre `SPRITE_URL` (actuellement `Record<HeroKind, string>`) en
`Record<HeroKind, {idle: string; hit?: string; ko?: string}>`, retomber sur
`idle` si un état n'a pas encore de pose dédiée (déploiement hero par hero
sans tout casser), et basculer `bv.sprite.texture` sur les deux hooks déjà en
place dans `syncBody` (chute de vitesse, transition alive→false) — les mêmes
qui alimentent déjà `renderImpacts()`.

**Boulder fait, Comet reste bloqué (2026-09-12, session autonome)** : le
quota ZeroGPU a mis environ 18h à revenir (bien plus que le « minuit UTC »
supposé — probablement une fenêtre glissante liée à la dernière génération de
la veille, pas un vrai reset quotidien fixe). Une fois revenu, seulement 2
générations ont été possibles avant un nouveau blocage (« ZeroGPU quota
exceeded — 90s requested vs 0s left ») : **Boulder touché + Boulder KO**
générés, détourés (`scripts/process-hero-sprites.mjs`), intégrés. Comet
touché/KO restent à générer (prompts prêts, cf. session : variante du prompt
Boulder avec « sleek lean agile dasher character », « narrow diamond-shaped
streamlined body », trait de mouvement coupé net).

**Comet encore bloqué (2026-09-13, tentative de reprise)** : quota ZeroGPU
du compte HF toujours épuisé (« You've hit your daily ZeroGPU limit », modal
d'incitation PRO) dès la première tentative — trop tôt après le dernier
cycle. Rien généré. Les deux prompts définitifs (variante du prompt Boulder
« touché » ci-dessus, adaptée au dasher) sont figés ici pour la prochaine
tentative, à coller tels quels sur
`https://huggingface.co/spaces/black-forest-labs/FLUX.1-schnell` :

> **Comet touché** : flat 2D vector game icon, full body sleek lean agile
> dasher character flinching backward from a hit mid-dash, narrow
> diamond-shaped streamlined body, leaning back off balance, one arm raised
> defensively, short motion trail behind cut off abruptly, bold thick black
> outline, single flat solid light grey silhouette fill, no shading, no
> gradient, no 3D render, minimalist esports mascot style, plain solid pure
> white background, centered, no text

> **Comet KO** : flat 2D vector game icon, full body sleek lean agile dasher
> character collapsed flat on the ground knocked out, narrow diamond-shaped
> streamlined body sprawled horizontally, motion trail cut off abruptly
> beside it, bold thick black outline, single flat solid light grey
> silhouette fill, no shading, no gradient, no 3D render, minimalist esports
> mascot style, plain solid pure white background, centered, no text

Pipeline inchangé une fois les 2 images obtenues : télécharger les `.webp`
dans `src/assets/heroes/` sous `comet_hit.webp`/`comet_ko.webp`, lancer
`node scripts/process-hero-sprites.mjs` (détourage + conversion PNG),
ajouter les imports + entrée `comet: {idle, hit, ko}` dans `SPRITE_URL`
(`src/game/renderer.ts`), vérifier `tsc`/`test`/`check`/`build`, puis
confirmer en vrai (match Comet vs Comet, choc + KO + respawn) avant de
commit.

**Comet fait (2026-09-13, quota revenu)** : quota ZeroGPU débloqué en
cours de session. Les deux prompts ci-dessus générés du premier coup sur
`https://black-forest-labs-flux-1-schnell.hf.space/` (Space directe plutôt
que la page wrapper `huggingface.co/spaces/...` — nécessaire pour
récupérer l'URL du fichier généré en JS sans se heurter au cross-origin
de l'iframe wrapper). Récupérés via l'URL `gradio_api/file=...image.webp`
qu'expose le composant `<img>` une fois l'image prête, téléchargés en
direct (`curl`) plutôt que via le bouton de téléchargement du site (a
déclenché un comportement navigateur incontrôlable une première fois —
contourné en travaillant sur l'URL du fichier plutôt que sur l'UI).
Détourés avec `node scripts/process-hero-sprites.mjs` (même pipeline,
zéro changement de script) puis intégrés dans `SPRITE_URL.comet` de
`renderer.ts` exactement comme Boulder. Les 6 héros ont donc chacun leur
pose idle ; Boulder et Comet ont en plus touché/KO — les 4 autres restent
sur idle seul (prochaine étape si on veut continuer, même pipeline).

Recette testée en vrai (hotseat, Comet des deux côtés dès le premier tour
via ban/pick) : sprite idle affiché sans erreur sur plusieurs tours,
plusieurs collisions déclenchées entre héros (confirmé via l'anneau de
choc visuel), zéro erreur console. La fenêtre de 220ms du sprite « touché »
et la pose KO n'ont pas pu être confirmées à l'œil dans cet environnement
d'automatisation (même limite déjà documentée pour Boulder : le rendu ne
se repeint que de façon sporadique, lié aux captures d'écran CDP plutôt
qu'à un vrai `requestAnimationFrame` continu) — mécanisme identique à
celui de Boulder, déjà vérifié bit à bit dans la session précédente.
`tsc`/`test`/`check`/`build` verts.

Intégration réalisée exactement comme prévu ci-dessus, avec un ajustement :
`heroTexture()` est devenu `heroTexture(hero, variant)` avec cache par
`${hero}:${url}`, et un nouveau `setBodySprite(bv, tex, r)` factorise le
recalcul de taille (aspect ratio) à chaque changement de texture — nécessaire
car les poses hit/KO n'ont pas forcément le même ratio que l'idle (Boulder KO
est étalé au sol, beaucoup plus large que haut). Un `bv.hitUntil` (nouveau
champ `BodyVisual`) fait revenir sur l'idle 220ms après un choc ; le KO ne
revient jamais tout seul (le corps disparaît), mais un respawn (`!bv.lastAlive`
→ `alive`) remet explicitement l'idle pour ne pas rester bloqué sur la pose KO
après une résurrection.

`npx tsc --noEmit`, `npm test`, `npm run check` tous verts. **Non vérifié en
vrai avec certitude** : l'environnement d'automatisation navigateur de cette
session tourne avec `document.hidden === true` en continu (aucune fenêtre au
premier plan réelle), et la boucle de rendu se met en pause dans cet état
(cf. règle du dessus) — impossible de laisser une résolution de tour se jouer
en accéléré pour observer la pose « touché » (fenêtre de 220ms) ou confirmer
qu'un respawn ne reste pas bloqué sur la pose KO. Vérifié en revanche : le
sprite idle de Boulder s'affiche sans erreur console, les deux nouveaux
fichiers PNG sont bien servis par Vite (200). **Prochaine session ou Zoe en
vrai** : jouer un match avec Boulder des deux côtés, encaisser un choc et un
KO, vérifier visuellement les poses et qu'un respawn revient bien à l'idle.

**Règle de repos entre tours (2026-09-13, demande directe de Zoe)** : un
héros qui vient d'agir ne peut plus être choisi le tour suivant, mais
redevient jouable au tour d'après (impossible de marteler le même héros deux
tours d'affilée). Implémenté au niveau moteur — `solver.ts` traite un ordre
ciblant un héros dont `actedLastTurn` est vrai comme un ordre invalide (même
traitement qu'un héros mort ou introuvable, cf. `resolve()`), donc la règle
est garantie côté serveur autoritaire sans rien changer à `server.ts` (même
fonction `resolve()` des deux côtés) ni au hash de sync (`actedLastTurn` y
était déjà inclus, ajouté pour la passive de Sling). `bot.ts` exclut ces
héros de ses candidats. Côté UI (`match.ts`, `renderer.ts`) : piège classique
à noter pour la suite — le champ à lire pour l'UI n'est **pas**
`actedLastTurn` (qui ne se met à jour qu'au *prochain* `resolve()`, donc en
retard d'un tour côté état affiché) mais `acting`, qui reflète directement
« a agi pendant le tour qu'on vient de résoudre » dans `this.state` courant.
Confusion faite une première fois, corrigée après. Héros en repos : sprite
assombri (alpha 0.45) + anneau pointillé discret dans `renderer.ts`, et le
bandeau d'action précise `"<Héros> a joué le tour dernier, il est en repos
ce tour-ci."` dans `match.ts`. Règle documentée dans
`docs/ricochet-playbook.html` §01 et dans le codex héros (`ui.ts`).

Test dédié dans `solver.test.ts` (héros agit tour 1, ignoré tour 2, agit de
nouveau tour 3) + `npx tsc --noEmit`/`npm test`/`npm run check`/`npm run
build` tous verts. Vérifié en vrai dans le navigateur : le hint texte est
apparu correctement (« Boulder a joué le tour dernier... ») et un
`console.log` temporaire dans `renderer.ts` a confirmé au runtime
`acting=true` / `cooling=true` pour Boulder au tour 2 — la logique est donc
prouvée correcte à l'exécution, mais l'indicateur visuel (assombrissement +
anneau) n'a pas pu être confirmé à l'œil dans cette session : même limite
que pour les animations ci-dessus (`document.hidden` en continu dans cet
environnement d'automatisation, la boucle de rendu ne se repeint que de
façon sporadique, liée aux captures d'écran CDP plutôt qu'à un vrai
`requestAnimationFrame` continu — confirmé en instrumentant `window.rAF`,
qui reste à 0 tant qu'aucun screenshot n'est demandé). **À confirmer
visuellement par Zoe** en jouant un vrai match.

**Équilibrage — signal objectif + un vrai correctif (2026-09-11 soir)**
`scripts/balance-report.ts` (nouveau, pas dans `npm test`/`check` — un
one-off comme `net-test.ts`) : round-robin d'équipes mono-héros (3x le même)
sur Carrefour, bot niveau 1 des deux côtés. Le moteur étant entièrement
déterministe, chaque matchup ne donne qu'**un seul** résultat — ce n'est pas
un échantillon statistique, juste un repérage des cas grossiers ; **le bot
niveau 1 n'utilise jamais les capacités**, donc ça teste les héros amputés de
leur identité (Grappin, Effondrement, Éclat...). Premier passage : Hook
perdait 0/7, y compris des scores 0-15 pas franchement resserrés.

En creusant `solver.ts` : le contact de charge de Hook (passive Accroche,
toujours active) utilisait un **pull fixe** (`YANK_PULL * 0.8`), indépendant
de sa vitesse de charge — contrairement au knockback standard de tout autre
héros de mêlée, qui scale avec la vitesse d'impact (`vn` dans le calcul
d'impulsion). Chargeait à fond ou à peine, même effet quasi nul, et Hook
perdait en plus 80 % de sa propre vitesse au contact (`*0.2`). Corrigé dans
`tuning.ts`/`solver.ts` : le pull scale maintenant sur la vitesse de charge
de Hook (`YANK_CONTACT_PULL_RATIO`, plancher `YANK_CONTACT_PULL_MIN`), Hook
garde 40 % de sa vitesse au lieu de 20 % (`YANK_SELF_KEEP`). Après
correction : Hook 0/7 (marge −13,3) → 1/7 (marge −8,9), les défaites 0-15
resserrées à 1-15/2-15/4-15. `npx tsc --noEmit`, `npm test`, `npm run check`
verts après le changement.

Arrêté volontairement là — Boulder/Sling dominent encore nettement à ce
niveau de bot, Ram/Comet restent faibles, mais aller plus loin sur un signal
de bot sans capacités serait théoriser plutôt que jouer (règle du
`CLAUDE.md`). **Reste (avec toi)** : équilibrage réel par de vraies parties,
capacités comprises ; code-splitting du bundle si sa taille devient gênante ;
qualité visuelle inégale entre héros (Boulder/Ram en rendu « figurine »
plein, Sling/Arc en trait fin plus sobre) — pas retouché, pas bloquant pour
la lisibilité en jeu.

**Migration UI vers React (fait 2026-09-13)** — demande directe de Zoe
(« il faut passer tout en react »), avec exigence de tests solides à chaque
étape. Inverse la décision du 2026-09-11 (« aucune dépendance runtime hors
rendu, pixi.js est la seule exception ») : react/react-dom en deviennent la
deuxième, documentée dans `CLAUDE.md`. `src/engine/` et `src/net/` déjà
100 % purs/DOM-free n'ont pas bougé — tout le chantier est resté dans
`src/game/`/`src/ui/`. Fait en 6 étapes incrémentales, chacune commitée et
testée en vrai dans le navigateur avant la suivante (plan détaillé conservé
dans l'historique de session) :

- Outillage (React 19 + plugin Vite, JSX) sans changement de comportement.
- Les 16 écrans (`ui.ts`) migrés un par un vers `src/ui/screens/*.tsx`
  (menu, profil, draft, compte, codex, spectate…), toujours montés depuis
  `ui.ts` via `createRoot` le temps de la transition.
- `App` (`app.ts`, classe impérative) remplacé par `App.tsx` (state machine
  d'écrans en `useState`), `main.ts` → `main.tsx`.
- Le HUD (`#hud`, réécrit à 60 fps — score, Momentum, timer, bandeau
  d'action) devient une arborescence JSX (`MatchHud.tsx`) mais garde des
  écritures impératives via `useRef` pour les champs à haute fréquence —
  seul endroit du projet qui écrit dans le DOM hors du cycle de rendu React,
  documenté comme tel.
- `Match`/`ReplayPlayer`/`SpectateView` (boucle rAF + `Renderer` internes,
  inchangés) encapsulés dans des composants wrapper
  (`MatchSession`/`ReplaySession`/`SpectateSession`) construits/détruits par
  un `useEffect` ; un `seq` incrémenté à chaque nouvelle session force React
  à démonter proprement l'ancienne avant de monter la suivante même quand
  `teardown()`+nouvelle session sont enchaînés dans le même appel
  synchrone (sinon React réutilise l'instance en place et l'ancienne boucle
  rAF continue de tourner en fond).
- Nettoyage : code mort supprimé (`show()`/wrappers d'écrans de `ui.ts`,
  `byId()` de `match.ts`, `animateBars()`, `esc()`), `<div id="root">` de
  l'étape outillage retiré d'`index.html` (jamais utilisé — `App`/`MatchHud`
  sont montés sur `#overlay`/`#hud` pour hériter du positionnement CSS
  existant, dans des roots React séparés ; le rideau hotseat a son propre
  `#curtain` pour la même raison, cf. `src/ui/mount.ts`).

**Bug préexistant trouvé et corrigé au passage** (documenté depuis P2,
jamais traité jusque-là) : cliquer « Rejouer » après un match plantait la
création du `Renderer` suivant (`checkMaxIfStatementsInShader: 0`). Cause :
la perte de contexte WebGL déclenchée par `app.destroy()` est asynchrone
côté navigateur — recréer un contexte sur le même `<canvas>` juste après
pouvait retomber sur un contexte encore « en cours de perte ». Fixé en
donnant à `Renderer` la responsabilité de créer un `<canvas>` neuf à chaque
construction (retiré à `dispose()`) au lieu de réutiliser un canvas
partagé — un canvas neuf n'a jamais eu de contexte, donc plus de course
possible.

Testé en vrai à chaque étape (extension Chrome) : tous les écrans un par
un, un match bot complet, un match hotseat complet avec rideau entre les
tours, un replay chargé depuis un fichier, un spectate, et du matchmaking
en ligne sur deux onglets — HUD miroir correct des deux côtés. Point
critique vérifié en dernier : match bot → « Rejouer » → nouveau match,
plantait systématiquement avant le fix ci-dessus, fonctionne maintenant
(y compris un 3ᵉ match dans la même page). Zéro warning/erreur console sur
l'ensemble. `npx tsc --noEmit`, `npm test`, `npm run check`, `npm run build`
verts à chaque étape.

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

**Mise à jour Glicko-2 après un vrai match classé — vérifiée (2026-09-11
soir)** : `POST /api/rollover-season` appelé en local (aucune saison
n'existait, ni en local ni en prod) pour créer « Saison 1 » (`active: true`,
56 jours). Script ponctuel `scripts/verify-ranked-season.ts` (pas dans
`npm test`/`check` — un one-off documenté, comme `net-test.ts` mais avec deux
vrais comptes PocketBase et la vraie IA du bot `pickOrder` plutôt que la
simulation minimale) : connecte deux comptes existants, les fait matcher en
classé, joue jusqu'à la fin réelle du match (hold 8/15), et lit `ratings` +
`season_ratings` avant/après. **Confirmé** : mu/phi/sigma bougent de façon
symétrique et plausible (perdant μ −0,93, gagnant μ +0,93, même φ), écrits
dans les deux tables. C'est le dernier point de P5 qui restait non vérifié en
conditions réelles — P5 est maintenant entièrement vérifié de bout en bout.

**Bug de course trouvé et corrigé en vérifiant** : la première tentative n'a
pas matché en classé malgré deux comptes valides — `matchFifoFallback()`
traitait `ratingDisplay === null` comme « invité », mais un compte dont la
vérification du token (`verifyToken` + `fetchRating`, un fetch réseau async)
est encore en vol a *aussi* `ratingDisplay: null` le temps du aller-retour.
Si les deux clients se connectent à quelques ms d'écart (typique de deux vrais
joueurs, pas seulement d'un script de test), l'un pouvait tomber en non
classé par pure course avant que sa vraie note soit connue. Corrigé par un
champ `Client.verified` (distinct de `ratingDisplay`), mis à `true`
seulement une fois la vérification retombée ; `matchFifoFallback` exige
maintenant `verified` en plus de `ratingDisplay === null` avant de traiter
quelqu'un comme invité. `npm test`, `npm run check`, `npm run net-test`,
`npm run build` tous verts après le changement (le chemin invité, qui ne doit
jamais attendre, reste immédiat).

Anti-abandon (un `over` par forfait compte comme défaite) déjà géré par
`onLeave()` côté `Match`, hérité de P3/P4 — rien à ajouter pour P5.

### Livrables

- Écran connexion / profil (choix du pseudo). ✅
- `src/net/session.ts` : gestion du JWT PocketBase, refresh. ✅
- File non classée fonctionnelle bout en bout. ✅
- Matchmaking par note + bascule `mode: "ranked"`. ✅ (reste à vérifier la
  mise à jour Glicko-2 en vrai une fois une saison active seedée, P7)
- Le serveur de match appelle `POST /api/settle-match` en fin de partie. ✅
  (`server/server.ts` → `pocketbase/pb_hooks/settle-match.pb.js`, avec le
  `mode` — `ranked` ou non — transmis ; vérifié en vrai en P5, cf. plus bas)

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
cron de bascule de saison (le règlement `settle-match` en mode `ranked` est
déjà branché et vérifié, cf. Phase 4 ci-dessus).

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
