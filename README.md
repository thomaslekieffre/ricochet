# Ricochet

Brawler 1v1 compétitif qui se joue dans un onglet. Mode **Contrôle** : tenir la
zone centrale avec plus de héros que l'adversaire, à résolution simultanée, avec
une physique de knockback. Ladder à saisons prévu. Inspiré de _BUMP! Superbrawl_.

- Conception d'ensemble : [`docs/ricochet-playbook.html`](docs/ricochet-playbook.html)
- Plan phase par phase : [`docs/PHASES.md`](docs/PHASES.md)
- Guide de contribution / invariants : [`CLAUDE.md`](CLAUDE.md)

---

## État

- **Phases 1-2** ✅ — jeu complet en local : mode Contrôle, 6 héros + capacités +
  Momentum, 3 arènes (Carrefour / Fonderie / Flipper), bot 3 niveaux, hotseat.
- **Phase 3** ✅ — serveur de match **autoritatif** (`npm run server`), 1v1 en
  ligne sans compte. Table de sinus figée, `hashState()` client/serveur, test
  d'intégration `npm run net-test`.
- **Phase 6** — **replays** : tout match s'enregistre (log d'ordres), se
  télécharge en JSON de quelques Ko, se rejoue à l'identique (lecteur avec
  navigation par tour).
- **Phases 4-5-7** 🟡 — `src/lib/glicko2.ts` (classé) complet et testé contre
  l'exemple de référence de Glickman ; migrations Supabase + Edge Function
  `settle-match` + `Dockerfile` / `docker-compose.yml` / `docs/DEPLOY.md` écrits
  mais **pas branchés** (attendent Supabase + VPS).

Détail phase par phase : `docs/PHASES.md`.

### Jouer en ligne (local)

```bash
npm run server   # terminal 1 — :8787
npm run dev      # terminal 2 — ouvrir deux onglets, menu → « En ligne »
```

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
npm test           # Vitest : moteur, Glicko-2, déterminisme (14 tests)
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
  net/        protocol.ts + client.ts (WebSocket navigateur)
  lib/        glicko2.ts (+ test) — notation classée
  game/       audio, renderer, ui, match, replay, replay-player, app
  main.ts  styles.css
server/       server.ts — serveur de match autoritatif (Node + ws)
scripts/      check.ts, net-test.ts, gen-trig-table.mjs
supabase/     migrations SQL + function settle-match (non branché)
docs/         ricochet-playbook.html, PHASES.md, DEPLOY.md
```

## Notes techniques

- **Déterminisme** : `solver.ts` n'utilise aucun flottant, aucun `Math.random`,
  aucun `Date`. Les collisions sont visitées dans l'ordre des identifiants. C'est
  ce qui rendra le serveur autoritatif (Phase 3) et les replays triviaux.
- **À geler avant la Phase 3** : la table de sinus de `trig.ts` est construite
  depuis `Math.sin` au chargement — à figer en constante versionnée pour un
  déterminisme inter-machines. Suffisant en local.
- **Rendu vs simulation** : `resolve()` renvoie des images-clés ; le `Renderer`
  ne fait que les rejouer, il ne calcule aucune physique.
- **Équilibrage** : tout est dans `src/engine/tuning.ts` et `heroes.ts`.
