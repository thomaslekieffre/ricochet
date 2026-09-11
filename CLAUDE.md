# CLAUDE.md

Guidance pour Claude Code (claude.ai/code) sur ce dépôt.

## Langue

Toujours répondre en français.

## Le projet

**Ricochet** — brawler 1v1 compétitif qui se joue dans le navigateur. Mode
**Contrôle** : tenir une zone centrale avec plus de héros que l'adversaire, à
résolution simultanée, avec une physique de knockback. Ladder à saisons prévu.
Inspiré de _BUMP! Superbrawl_.

Le plan de référence, phase par phase, est **[`docs/PHASES.md`](docs/PHASES.md)**.
La conception d'ensemble est **[`docs/ricochet-playbook.html`](docs/ricochet-playbook.html)**.

## Commandes

```bash
npm run dev       # serveur de dev Vite (http://localhost:5173)
npm run server    # serveur de match autoritatif WebSocket (:8787)
npm run build     # tsc --noEmit puis build de prod
npm test          # suite Vitest (moteur + Glicko-2 + déterminisme)
npm run test:watch
npm run check     # smoke test standalone : déterminisme + stabilité + replay + bot
npm run net-test  # intégration P3 : 2 clients, hash serveur == résolveur local
npx tsc --noEmit  # typecheck seul
```

Regénérer la table de sinus figée (rare) : `node scripts/gen-trig-table.mjs`.

## Architecture

### Stack

- **TypeScript strict** + **Vite** — pas de framework, rendu **Canvas 2D**.
- **Vitest** pour les tests du moteur.
- Aucune dépendance runtime. Audio synthétisé (WebAudio), aucun asset binaire.
- Cible des phases réseau : **Bun + ws** (serveur), **Supabase** (Postgres +
  Auth), déploiement **Coolify** sur le VPS. Rien de tout ça n'est encore branché.

### Découpage

```
src/
  engine/            moteur déterministe — ZÉRO dépendance au DOM, testable seul
    fixed.ts         arithmétique point fixe Q16.16 (BigInt) : mul / div / sqrt
    trig.ts / trig-table.ts   sin/cos par table FIGÉE (constante base64)
    tuning.ts        TOUTES les constantes de gameplay, en point fixe
    types.ts         Body, GameState, Order, Frame, Arena, TurnEvent…
    heroes.ts        table des 6 héros (stats + descripteurs de capacité)
    arenas.ts        Carrefour, Fonderie, Flipper
    solver.ts        resolve(state, orderA, orderB) -> { state, frames, events }
    hash.ts          hashState() — comparaison client/serveur (P3)
    bot.ts           IA gloutonne 1-ply (hors contrat déterministe)
    index.ts         API publique + newMatch()
    *.test.ts        déterminisme, non-NaN, Momentum, scoring, table figée
  net/               protocole + client WebSocket (P3)
    protocol.ts      messages typés client<->serveur
    client.ts        NetClient (wrapper WS navigateur)
  lib/
    glicko2.ts       notation classée (P5), + glicko2.test.ts (exemple de réf.)
  game/              couche navigateur
    audio.ts renderer.ts ui.ts
    match.ts         machine à états d'un match (local / hotseat / en ligne)
    replay.ts replay-player.ts   enregistrement + lecture déterministe (P6)
    app.ts           enchaînement des écrans
  main.ts  styles.css
server/server.ts     serveur de match autoritatif (Node + ws) — P3
scripts/             check.ts, net-test.ts, gen-trig-table.mjs
supabase/            migrations SQL (P4/5/7) + function settle-match (non branché)
docs/                playbook, PHASES.md, DEPLOY.md
```

### L'invariant qui gouverne tout : le déterminisme

Le solveur (`src/engine/solver.ts`) est une **fonction pure**. Mêmes entrées →
sorties **identiques au bit près**, sur toute machine :

- **Aucun flottant dans le hot-path.** Positions, vitesses, impulsions sont des
  entiers Q16.16 ; chaque `mul` / `div` / `sqrt` passe par BigInt (`fixed.ts`).
- **Aucun `Math.random`, aucun `Date`** dans la simulation.
- **Ordre d'itération stable** : les paires de corps sont visitées dans l'ordre
  croissant des identifiants.
- Le flottant n'est toléré que côté **entrée** (quantifier un angle de souris en
  index de table) et côté **rendu** (l'affichage, jamais la simulation) et dans
  le **bot** (seul l'`Order` qu'il renvoie est rejoué, pas son raisonnement).

Toute modif du moteur doit préserver ça. `npm run check` et `npm test` le vérifient.

> La table de sinus est **figée** (`trig-table.ts`, constante base64 générée par
> `scripts/gen-trig-table.mjs`) : identique sur toute machine, revalidée par
> `determinism.test.ts`. `hash.ts` compare l'état client/serveur à chaque tour.

### Équilibrage

Tous les nombres de gameplay sont dans **`src/engine/tuning.ts`** (et les stats
par héros dans `heroes.ts`). On règle le _feel_ en jouant, pas en théorisant. Ne
pas éparpiller des constantes magiques dans le solveur.

## Definition of done (la « recette »)

Une tâche n'est finie que si **les quatre** sont vrais — aucun ne remplace un autre :

1. **Technique** : `npx tsc --noEmit` sans erreur, `npm test` sans échec nouveau,
   `npm run check` → `ALL GREEN`. Un test attendu dès que la logique est pure
   (tout `src/engine/`).
2. **Recette fonctionnelle** : lancer `npm run dev`, jouer le cas réel dans le
   navigateur (onglet au premier plan — la boucle de rendu se met en pause si
   l'onglet est en arrière-plan), vérifier les cas limites (héros en respawn,
   Momentum à 0 et à 5, mort subite, hotseat des deux côtés).
3. **Non-régression** : les autres usages du code partagé (les 6 héros, les 3
   arènes, bot vs hotseat) tiennent toujours.
4. **Déterminisme préservé** : aucun flottant/`Math.random`/`Date` introduit dans
   `solver.ts` ou ses dépendances de simulation.

Règle dominante : *ce qui n'a pas été exécuté n'est pas vérifié*.

## Github

Terminer les messages de commit par :

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0122W7iz1Jxuf7ViGsJQcqzr
```
