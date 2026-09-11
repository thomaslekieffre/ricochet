import type { HeroKind } from "../engine/index";
import { NetClient } from "../net/client";
import type { ServerMsg } from "../net/protocol";
import { Session } from "../net/session";
import {
  applyOutcome,
  clearProfile,
  freshProfile,
  levelFromXp,
  loadProfile,
  ratingView,
  renameProfile,
  saveProfile,
  winrate,
} from "../lib/profile";
import type { Profile } from "../lib/profile";
import { Match } from "./match";
import type { MatchOpts } from "./match";
import { ReplayPlayer } from "./replay-player";
import { downloadRecording, makeRecording, parseRecording } from "./replay";
import { SpectateView } from "./spectate-view";
import {
  accountScreen,
  banPickScreen,
  codexScreen,
  hideOverlay,
  menuScreen,
  nameScreen,
  noticeScreen,
  onlineDraftScreen,
  profileScreen,
  resultScreen,
  searchingScreen,
  spectateListScreen,
} from "./ui";
import type { HistoryRow, SpectateRow, StartOpts } from "./ui";

const ARENA_LABEL: Record<string, string> = {
  carrefour: "Carrefour",
  fonderie: "Fonderie",
  flipper: "Flipper",
};
const BOT_LABEL: Record<1 | 2 | 3, string> = {
  1: "Souple",
  2: "Correct",
  3: "Coriace",
};
const arenaLabel = (id: string): string => ARENA_LABEL[id] ?? id;

/** Le bandeau « zone tenue » du score final, camp 0 à gauche, camp 1 à droite. */
function scorelineHtml(hold: [number, number] | number[]): string {
  return `<div class="scoreline">
    <b class="s-a">${hold[0] ?? 0}</b>
    <span>zone tenue</span>
    <b class="s-b">${hold[1] ?? 0}</b>
  </div>`;
}

export class App {
  private match: Match | null = null;
  private replay: ReplayPlayer | null = null;
  private spectate: SpectateView | null = null;
  private net: NetClient | null = null;
  private last: { opts: StartOpts; teamA: HeroKind[]; teamB: HeroKind[] } | null = null;
  private profile: Profile | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.profile = loadProfile();
    if (this.profile) {
      this.toMenu();
    } else {
      nameScreen("", (name) => {
        this.profile = freshProfile(name);
        saveProfile(this.profile);
        this.toMenu();
      });
    }
    // best-effort, silencieux si non connecté ou serveur PocketBase injoignable
    void Session.refresh();
  }

  private toMenu(): void {
    this.teardown();
    menuScreen(
      this.menuChip(),
      (o) => this.onStart(o),
      () => this.pickReplayFile(),
      () => this.showProfile(),
      () => codexScreen(() => this.toMenu()),
      () => this.startSpectate(),
    );
  }

  private menuChip(): { name: string; level: number; line: string } | null {
    const p = this.profile;
    if (!p) return null;
    const rv = ratingView(p);
    return {
      name: p.name,
      level: levelFromXp(p.xp).level,
      line: rv.placed ? `${rv.tierLabel} · ${rv.rating}` : "Non classé",
    };
  }

  private onStart(o: StartOpts): void {
    this.teardown();
    if (o.mode === "online") {
      this.startOnline(o);
    } else {
      banPickScreen(o.mode === "hotseat", (teamA, teamB) => {
        this.last = { opts: o, teamA, teamB };
        this.startLocalMatch();
      });
    }
  }

  // ---- local (bot / hotseat) -----------------------------------------

  private startLocalMatch(): void {
    if (!this.last) return;
    this.teardown();
    const { opts, teamA, teamB } = this.last;
    const mo: MatchOpts = {
      teamA,
      teamB,
      arenaId: opts.arenaId,
      sides: opts.mode === "hotseat" ? ["human", "human"] : ["human", "bot"],
      botLevel: opts.botLevel,
      onOver: (winner) => this.onLocalOver(winner, opts.mode),
    };
    this.match = new Match(this.canvas, mo);
  }

  private onLocalOver(winner: 0 | 1, mode: StartOpts["mode"]): void {
    const m = this.match;
    const opts = this.last?.opts;
    const won = winner === 0; // le profil local joue toujours le camp 0
    const score = m?.holdScore ?? [0, 0];
    let progressHtml = scorelineHtml(score);

    if (m && opts && this.profile && (mode === "bot" || mode === "hotseat")) {
      const comps = m.teamComps;
      const applied = applyOutcome(this.profile, {
        mode,
        botLevel: mode === "bot" ? opts.botLevel : undefined,
        arena: m.arenaId,
        team: comps.a,
        opp: comps.b,
        won,
        turns: m.turnsPlayed,
        hold: m.holdScore,
      });
      this.profile = applied.profile;
      saveProfile(this.profile);
      progressHtml += this.progressHtml(applied.xpGained, applied.ratingDelta, applied.leveledTo);
    }

    const label =
      mode === "bot" ? (won ? "Gagné" : "Perdu") : `Joueur ${winner + 1} gagne`;
    const tone: "win" | "loss" | "neutral" =
      mode === "bot" ? (won ? "win" : "loss") : "neutral";
    resultScreen(
      label,
      winner === 1 && mode === "bot" ? "Le bot a tenu la zone." : "La zone est à toi.",
      () => this.startLocalMatch(),
      () => this.toMenu(),
      this.replayDownloader(winner),
      progressHtml,
      tone,
    );
  }

  private progressHtml(
    xp: number,
    ratingDelta: number | null,
    leveledTo: number | null,
  ): string {
    const p = this.profile!;
    const lv = levelFromXp(p.xp);
    const pct = Math.round((lv.into / lv.span) * 100);
    const bits = [`+${xp} XP`];
    if (ratingDelta !== null) {
      bits.push(`note ${ratingDelta >= 0 ? "+" : ""}${ratingDelta}`);
    }
    if (leveledTo !== null) bits.push(`niveau ${leveledTo} atteint !`);
    return `<div class="prog">
      <div class="xpbar"><span data-fill="${pct}" style="width:0"></span></div>
      <p class="sub">${bits.join(" · ")} — Nv ${lv.level} (${lv.into}/${lv.span})</p>
    </div>`;
  }

  // ---- profil -----------------------------------------------------

  private showProfile(): void {
    const p = this.profile;
    if (!p) {
      this.toMenu();
      return;
    }
    const lv = levelFromXp(p.xp);
    const rv = ratingView(p);
    const streakLabel =
      p.streak >= 2
        ? `série de ${p.streak} victoires`
        : p.streak <= -2
          ? `série de ${-p.streak} défaites`
          : "";
    const ratingLine = rv.placed
      ? `${rv.tierLabel} · ${rv.rating} (±${rv.rd})`
      : `Non classé · ${rv.placementLeft} partie${rv.placementLeft > 1 ? "s" : ""} avant classement`;

    const history: HistoryRow[] = p.history.slice(0, 12).map((h) => {
      const lbl =
        h.mode === "bot"
          ? `vs Bot ${BOT_LABEL[h.botLevel ?? 2]} · ${arenaLabel(h.arena)}`
          : `Hotseat · ${arenaLabel(h.arena)}`;
      const delta =
        h.ratingBefore !== null && h.ratingAfter !== null
          ? `+${h.xpGained} XP · ${h.ratingAfter - h.ratingBefore >= 0 ? "+" : ""}${h.ratingAfter - h.ratingBefore}`
          : `+${h.xpGained} XP`;
      return {
        won: h.won,
        label: lbl,
        score: `${h.hold[0]}–${h.hold[1]}`,
        delta,
      };
    });

    const su = Session.user();
    const accountLine = su
      ? `Compte PocketBase : ${su.email}`
      : "Pas de compte PocketBase — profil local à ce navigateur uniquement.";

    profileScreen(
      {
        name: p.name,
        level: lv.level,
        into: lv.into,
        span: lv.span,
        xp: p.xp,
        games: p.games,
        wins: p.wins,
        losses: p.losses,
        winrate: winrate(p),
        streakLabel,
        ratingLine,
        history,
      },
      () => this.toMenu(),
      () => this.renameFlow(),
      () => this.resetFlow(),
      () => this.showAccount(),
      accountLine,
    );
  }

  private showAccount(): void {
    const su = Session.user();
    accountScreen(
      su,
      (email, password) => Session.login(email, password).then(() => {}),
      (email, password, name) => Session.register(email, password, name).then(() => {}),
      () => Session.logout(),
      () => this.showProfile(),
    );
  }

  private renameFlow(): void {
    const p = this.profile;
    if (!p) return this.toMenu();
    nameScreen(
      p.name,
      (name) => {
        this.profile = renameProfile(p, name);
        this.showProfile();
      },
      () => this.showProfile(),
    );
  }

  private resetFlow(): void {
    clearProfile();
    this.profile = null;
    nameScreen("", (name) => {
      this.profile = freshProfile(name);
      saveProfile(this.profile);
      this.toMenu();
    });
  }

  // ---- online -------------------------------------------------------

  private startOnline(o: StartOpts): void {
    this.teardown();
    const client = new NetClient();
    this.net = client;
    let matchId = "";

    const off = client.on((m: ServerMsg) => {
      if (m.t === "paired") {
        matchId = m.matchId;
      } else if (m.t === "draft") {
        onlineDraftScreen(
          m.phase,
          m.pool,
          (hero) => client.send({ t: "ban", matchId, hero }),
          (team) =>
            client.send({
              t: "pick",
              matchId,
              team: team as [HeroKind, HeroKind, HeroKind],
            }),
          () => {
            off();
            client.send({ t: "cancel" });
            this.teardown();
            this.toMenu();
          },
        );
      } else if (m.t === "matched") {
        off();
        hideOverlay();
        this.startNetMatch(client, m, o);
      } else if (m.t === "error") {
        off();
        this.teardown();
        noticeScreen("Connexion perdue", "Le serveur ne répond plus.", () => this.toMenu());
      }
    });

    searchingScreen(() => {
      client.send({ t: "cancel" });
      this.teardown();
      this.toMenu();
    });

    client
      .connect()
      .then(() =>
        client.send({ t: "queue", setup: { arenaId: o.arenaId, token: Session.token() } }),
      )
      .catch(() => {
        this.teardown();
        noticeScreen(
          "Serveur injoignable",
          "Lance <code>npm run server</code> puis réessaie.",
          () => this.toMenu(),
        );
      });
  }

  private startNetMatch(
    client: NetClient,
    matched: Extract<ServerMsg, { t: "matched" }>,
    o: StartOpts,
  ): void {
    const seat = matched.seat;
    const mo: MatchOpts = {
      teamA: [],
      teamB: [],
      arenaId: o.arenaId,
      sides: seat === 0 ? ["human", "remote"] : ["remote", "human"],
      botLevel: 2,
      net: { client, matchId: matched.matchId, seat },
      initialState: matched.state,
      onOver: (winner) => {
        this.net = null;
        client.close();
        // le serveur a appelé settle-match — resynchronise l'XP de compte si connecté
        void Session.refresh();
        const score = this.match?.holdScore ?? [0, 0];
        resultScreen(
          winner === seat ? "Gagné" : "Perdu",
          winner === seat ? "La zone est à toi." : "L'adversaire a tenu la zone.",
          () => this.startOnline(o),
          () => this.toMenu(),
          this.replayDownloader(winner),
          scorelineHtml(score),
          winner === seat ? "win" : "loss",
        );
      },
      onDisconnect: () => {
        this.teardown();
        noticeScreen("Adversaire déconnecté", "", () => this.toMenu());
      },
    };
    this.match = new Match(this.canvas, mo);
  }

  // ---- replays ----------------------------------------------------

  private replayDownloader(winner: 0 | 1): (() => void) | undefined {
    const m = this.match;
    if (!m || m.log.length === 0) return undefined;
    const comps = m.teamComps;
    const arenaId = m.arenaId;
    const log = m.log.slice();
    return () =>
      downloadRecording(
        makeRecording({ teamA: comps.a, teamB: comps.b, arenaId }, log, winner),
      );
  }

  private pickReplayFile(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        this.toMenu();
        return;
      }
      try {
        const rec = parseRecording(await file.text());
        this.teardown();
        this.replay = new ReplayPlayer(this.canvas, rec, () => this.toMenu());
      } catch (e) {
        noticeScreen("Replay illisible", String((e as Error).message), () => this.toMenu());
      }
    });
    input.click();
  }

  // ---- spectate -----------------------------------------------------

  private startSpectate(): void {
    this.teardown();
    const client = new NetClient();
    this.net = client;
    client
      .connect()
      .then(() => this.refreshSpectateList(client))
      .catch(() => {
        this.teardown();
        noticeScreen(
          "Serveur injoignable",
          "Lance <code>npm run server</code> puis réessaie.",
          () => this.toMenu(),
        );
      });
  }

  private refreshSpectateList(client: NetClient): void {
    const off = client.on((m: ServerMsg) => {
      if (m.t !== "matchList") return;
      off();
      const rows: SpectateRow[] = m.matches.map((mi) => ({
        matchId: mi.matchId,
        label: `${arenaLabel(mi.arenaId)} · tour ${mi.turn}`,
      }));
      spectateListScreen(
        rows,
        (matchId) => this.watchMatch(client, matchId),
        () => this.refreshSpectateList(client),
        () => {
          this.teardown();
          this.toMenu();
        },
      );
    });
    client.send({ t: "listMatches" });
  }

  private watchMatch(client: NetClient, matchId: string): void {
    const off = client.on((m: ServerMsg) => {
      if (m.t === "spectating" && m.matchId === matchId) {
        off();
        this.spectate = new SpectateView(this.canvas, client, m.state, () => {
          this.teardown();
          this.toMenu();
        });
      } else if (m.t === "error") {
        off();
        this.teardown();
        noticeScreen("Connexion perdue", "Le serveur ne répond plus.", () => this.toMenu());
      }
    });
    client.send({ t: "spectate", matchId });
  }

  // ---- teardown -------------------------------------------------

  private teardown(): void {
    this.match?.dispose();
    this.match = null;
    this.replay?.dispose();
    this.replay = null;
    this.spectate?.dispose();
    this.spectate = null;
    this.net?.close();
    this.net = null;
  }
}
