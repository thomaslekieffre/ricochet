# Ricochet

Brawler 1v1 compétitif qui se joue dans un onglet. Mode **Contrôle** : tenir la
zone centrale avec plus de héros que l'adversaire, à résolution simultanée, avec
une physique de knockback. Ladder à saisons prévu. Inspiré de _BUMP! Superbrawl_.

- Conception d'ensemble : [`docs/ricochet-playbook.html`](docs/ricochet-playbook.html)
- Plan phase par phase : [`docs/PHASES.md`](docs/PHASES.md)
- Guide de contribution / invariants : [`CLAUDE.md`](CLAUDE.md)

---

## État

- **Phases 1-2** ✅ — jeu complet en local : mode Contrôle, **8 héros** +
  capacités + Momentum, 3 arènes (Carrefour / Fonderie / Flipper), bot 3
  niveaux (dans un Web Worker), hotseat. Rendu passé sur **PixiJS** (WebGL)
  le 2026-09-11 : silhouettes par archétype, squash & stretch au choc,
  particules, traînées, glow — les vrais sprites/anims par héros restent à
  faire (génération IA prévue, bloquée pour l'instant par le plan du compte
  connecté).
- **Phase 3** ✅ — serveur de match **autoritatif** (`npm run server`), 1v1 en
  ligne sans compte. Table de sinus figée, `hashState()` client/serveur, test
  d'intégration `npm run net-test`.
- **Phase 4** ✅ — comptes **PocketBase** branchés pour de vrai : écran
  connexion/inscription/déconnexion (`accountScreen`), JWT transmis au
  serveur de match, `settle-match` appelé à chaque match en ligne, profil
  local synchronisé. Testé en vrai (compte créé, match complet joué, XP de
  compte vérifié en base).
- **Phase 5** 🟡 — `src/lib/glicko2.ts` (classé) complet et testé contre
  l'exemple de référence de Glickman. **Matchmaking par note fait et testé**
  (fenêtre `±(60+12s)` qui s'élargit avec l'attente ; jouer sans compte reste
  toujours immédiat) — reste à vérifier la mise à jour Glicko-2 en vrai une
  fois une saison active seedée (P7).
- **Phase 6** ✅ — **ban/pick** (local et en ligne), **replays** (log d'ordres,
  JSON de quelques Ko, lecture avec navigation par tour), **spectate** (suivre
  un match en direct depuis le menu).
- **Phase 7** 🟡 — collections + hooks **PocketBase** (`pocketbase/`, pas
  Supabase — auto-hébergé sur le VPS) + `Dockerfile` / `docker-compose.yml` /
  `docs/DEPLOY.md` écrits et **testés en local** (migrations appliquées,
  `settle-match`/`rollover-season` appelés pour de vrai) mais **pas déployés**
  en prod ; aucune saison seedée.

Détail phase par phase : `docs/PHASES.md`.

### Jouer en ligne (local)

```bash
npm run server   # terminal 1 — :8787
npm run dev      # terminal 2 — ouvrir deux onglets, menu → « En ligne »
```

Pour tester les comptes/le classé, il faut en plus une instance **PocketBase**
locale (`pocketbase/README.md`) et `POCKETBASE_URL=http://127.0.0.1:8090` dans
l'environnement du serveur de match (voir `.env.example`).

---

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173
```

> Garde l'onglet au premier plan pendant une partie : le navigateur met la boucle
> de rendu en pause quand l'onglet passe en arrière-plan.

### Autres commandes

```bash
npm test           # Vitest : moteur, Glicko-2, déterminisme (27 tests)
npm run check      # smoke test : déterminisme + stabilité + replay + bot
npm run net-test   # intégration P3 : hash serveur == résolveur local
npm run build      # typecheck + build de prod
```

### Contrôles

| Action | Entrée |
| --- | --- |
| Choisir un héros | clic dessus, ou `1` / `2` / `3` |
| Viser (direction + puissance) | clic-glisser depuis le héros, relâcher |
| Armer la capacité active | `A` ou la case à cocher |
| Passer le tour | bouton « Passer le tour » |
| Passer l'animation | `Espace` |
| Replay : lecture/pause · tour précédent/suivant | `Espace` · `←` / `→` |

---

## Structure

```
src/
  engine/     moteur déterministe (aucun DOM) : fixed, trig-table figée, solver,
              hash, heroes, arenas, bot, index, *.test.ts
  net/        protocol.ts, client.ts (WebSocket navigateur), session.ts (auth PocketBase)
  lib/        glicko2.ts (+ test) — notation classée
  game/       audio, renderer (PixiJS), ui, match, bot-client/bot.worker,
              replay, replay-player, spectate-view, app
  main.ts  styles.css
server/       server.ts — serveur de match autoritatif (Node + ws) + matchmaking
scripts/      check.ts, net-test.ts, gen-trig-table.mjs
pocketbase/   collections + hooks settle-match/rollover-season (branché au
              serveur de match, pas encore déployé en prod)
docs/         ricochet-playbook.html, PHASES.md, DEPLOY.md
```

## Notes techniques

- **Déterminisme** : `solver.ts` n'utilise aucun flottant, aucun `Math.random`,
  aucun `Date`. Les collisions sont visitées dans l'ordre des identifiants —
  c'est ce qui rend le serveur autoritatif (Phase 3) et les replays triviaux.
  La table de sinus (`trig-table.ts`) est figée en constante versionnée,
  revalidée par un test.
- **Rendu vs simulation** : `resolve()` renvoie des images-clés ; le
  `Renderer` (PixiJS) ne fait que les rejouer, il ne calcule aucune physique.
  Seule dépendance runtime du projet (`pixi.js`), exception documentée dans
  `CLAUDE.md`.
- **Équilibrage** : tout est dans `src/engine/tuning.ts` et `heroes.ts`.
- **Comptes/classé** : `src/net/session.ts` (auth PocketBase côté navigateur,
  `fetch` brut), `server/server.ts` vérifie le JWT et appelle
  `POST /api/settle-match` en fin de match, matchmaking par fenêtre de note
  (`±(60+12s)`) — détail complet dans `docs/PHASES.md` P4/P5.
