import { useEffect, useRef, useState } from "react";
import type { GameState, HeroKind } from "../engine/index";
import { NetClient } from "../net/client";
import { Leaderboard } from "../net/leaderboard";
import type { RankRow } from "../net/leaderboard";
import type { ServerMsg } from "../net/protocol";
import { Session } from "../net/session";
import {
  applyOutcome,
  clearProfile,
  equipCosmetic,
  freshProfile,
  levelFromXp,
  loadProfile,
  ratingView,
  renameProfile,
  saveProfile,
  winrate,
} from "../lib/profile";
import { Cosmetics } from "../net/cosmetics";
import type { Cosmetic } from "../net/cosmetics";
import type { Profile } from "../lib/profile";
import { Match } from "./match";
import type { MatchOpts } from "./match";
import { playMusic } from "./music";
import { MatchSession } from "./MatchSession";
import type { HudEls } from "./MatchHud";
import { ReplaySession } from "./ReplaySession";
import { downloadRecording, makeRecording, parseRecording } from "./replay";
import type { RecordedMatch } from "./replay";
import { SpectateSession } from "./SpectateSession";
import { AccountScreen } from "../ui/screens/AccountScreen";
import type { AccountUser } from "../ui/screens/AccountScreen";
import { BanPickScreen } from "../ui/screens/BanPickScreen";
import { CodexScreen } from "../ui/screens/CodexScreen";
import { MenuScreen } from "../ui/screens/MenuScreen";
import type { MenuChip } from "../ui/screens/MenuScreen";
import { NameScreen } from "../ui/screens/NameScreen";
import { NoticeScreen } from "../ui/screens/NoticeScreen";
import { OnlineDraftScreen } from "../ui/screens/OnlineDraftScreen";
import { LockerScreen } from "../ui/screens/LockerScreen";
import { ProfileScreen } from "../ui/screens/ProfileScreen";
import type { HistoryRow, ProfileView } from "../ui/screens/ProfileScreen";
import { RankScreen } from "../ui/screens/RankScreen";
import { ResultScreen } from "../ui/screens/ResultScreen";
import { SearchingScreen } from "../ui/screens/SearchingScreen";
import { SpectateListScreen } from "../ui/screens/SpectateListScreen";
import type { SpectateRow } from "../ui/screens/SpectateListScreen";
import type { StartOpts } from "./ui";

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

type Screen =
  | { kind: "menu"; chip: MenuChip | null }
  | { kind: "name"; initial: string; onDone: (name: string) => void; onCancel?: () => void }
  | { kind: "profile"; view: ProfileView; accountLine: string }
  | { kind: "account"; user: AccountUser | null }
  | { kind: "codex" }
  | { kind: "banPick"; hotseat: boolean; onDone: (teamA: HeroKind[], teamB: HeroKind[]) => void }
  | {
      kind: "onlineDraft";
      phase: "ban" | "pick";
      pool: HeroKind[];
      onBan: (hero: HeroKind) => void;
      onPick: (team: HeroKind[]) => void;
      onCancel: () => void;
    }
  | { kind: "searching"; onCancel: () => void }
  | { kind: "notice"; title: string; sub: string; onOk: () => void }
  | {
      kind: "result";
      title: string;
      sub: string;
      onRematch: () => void;
      onMenu: () => void;
      onDownloadReplay?: () => void;
      progressHtml?: string;
      tone?: "win" | "loss" | "neutral";
    }
  | {
      kind: "spectateList";
      rows: SpectateRow[];
      onWatch: (matchId: string) => void;
      onRefresh: () => void;
      onCancel: () => void;
    }
  | {
      kind: "rank";
      loading: boolean;
      error: string | null;
      seasonName: string | null;
      me: RankRow | null;
      rows: RankRow[];
    }
  | {
      kind: "locker";
      loading: boolean;
      error: string | null;
      catalog: Cosmetic[];
      owned: Set<string>;
    };

/**
 * Une session canvas active (au plus une à la fois) : `Match`/`ReplayPlayer`/
 * `SpectateView` restent des classes impératives (boucle `requestAnimationFrame`
 * propre, inchangées) mais sont désormais construites/détruites via le cycle
 * de vie React (`<MatchSession>`/`<ReplaySession>`/`<SpectateSession>`,
 * `useEffect` de montage/nettoyage) plutôt qu'à la main dans les fonctions de
 * transition — étape 5 du plan de migration.
 */
type SessionSpec =
  | { kind: "match"; opts: MatchOpts }
  | { kind: "replay"; rec: RecordedMatch; onExit: () => void }
  | { kind: "spectate"; client: NetClient; initialState: GameState; onExit: () => void };

/**
 * Racine React de l'appli (montée dans `#overlay`, cf. commentaire de montage
 * en bas de fichier) : porte la state machine d'écrans (menu/draft/résultat/
 * profil/...) et l'aiguillage vers les sessions de jeu.
 */
export function App({ host, hud }: { host: HTMLElement; hud: HudEls }) {
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile());
  const [screen, setScreen] = useState<Screen | null>(null);
  const [session, setSession] = useState<{ seq: number; spec: SessionSpec } | null>(null);
  const profileRef = useRef(profile);
  const sessionSeq = useRef(0);
  const matchRef = useRef<Match | null>(null);
  const netRef = useRef<NetClient | null>(null);
  const lastRef = useRef<{ opts: StartOpts; teamA: HeroKind[]; teamB: HeroKind[] } | null>(null);

  // une nouvelle session = un nouveau `seq` -> un nouvel élément React (clé
  // différente) -> React démonte proprement l'ancienne session (dispose())
  // avant de monter la nouvelle, même si les deux setState sont enchaînés
  // dans le même appel synchrone (teardown() puis startSession() plus bas).
  function startSession(spec: SessionSpec): void {
    sessionSeq.current += 1;
    setSession({ seq: sessionSeq.current, spec });
  }

  // synchrone : évite qu'un toMenu()/showProfile() enchaîné juste après lise
  // encore l'ancienne valeur (le useEffect qui suivrait `profile` n'aurait
  // pas encore tourné à ce moment de l'appel).
  function updateProfile(p: Profile | null): void {
    profileRef.current = p;
    setProfile(p);
  }

  // affiche/masque le conteneur #overlay selon qu'un écran est actif
  useEffect(() => {
    const el = document.getElementById("overlay");
    if (el) el.hidden = screen === null;
  }, [screen]);

  // musique de fond : menu tant qu'aucune session canvas n'est active, sinon
  // le morceau de l'arène jouée (match / replay / spectateur partagent le
  // même arenaId au sens large).
  useEffect(() => {
    const spec = session?.spec;
    if (!spec) {
      playMusic("menu");
      return;
    }
    const arenaId =
      spec.kind === "match"
        ? spec.opts.arenaId
        : spec.kind === "replay"
          ? spec.rec.setup.arenaId
          : spec.initialState.arena.id;
    playMusic(arenaId);
  }, [session]);

  useEffect(() => {
    void Session.refresh();
    if (profileRef.current) {
      toMenu();
    } else {
      setScreen({
        kind: "name",
        initial: "",
        onDone: (name) => {
          const p = freshProfile(name);
          saveProfile(p);
          updateProfile(p);
          toMenu();
        },
      });
    }
    // ne s'exécute qu'au montage — vérifie le profil une seule fois au boot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function teardown(): void {
    setSession(null);
    matchRef.current = null;
    netRef.current?.close();
    netRef.current = null;
  }

  function menuChipFor(p: Profile | null): MenuChip | null {
    if (!p) return null;
    const rv = ratingView(p);
    return {
      name: p.name,
      level: levelFromXp(p.xp).level,
      line: rv.placed ? `${rv.tierLabel} · ${rv.rating}` : "Non classé",
    };
  }

  function toMenu(): void {
    teardown();
    setScreen({ kind: "menu", chip: menuChipFor(profileRef.current) });
  }

  function onStart(o: StartOpts): void {
    teardown();
    if (o.mode === "online") {
      startOnline(o);
      return;
    }
    setScreen({
      kind: "banPick",
      hotseat: o.mode === "hotseat",
      onDone: (teamA, teamB) => {
        lastRef.current = { opts: o, teamA, teamB };
        startLocalMatch();
      },
    });
  }

  // ---- local (bot / hotseat) -----------------------------------------

  function startLocalMatch(): void {
    if (!lastRef.current) return;
    teardown();
    const { opts, teamA, teamB } = lastRef.current;
    const mo: MatchOpts = {
      teamA,
      teamB,
      arenaId: opts.arenaId,
      sides: opts.mode === "hotseat" ? ["human", "human"] : ["human", "bot"],
      botLevel: opts.botLevel,
      hud,
      onOver: (winner) => onLocalOver(winner, opts.mode),
    };
    startSession({ kind: "match", opts: mo });
    setScreen(null);
  }

  function onLocalOver(winner: 0 | 1, mode: StartOpts["mode"]): void {
    const m = matchRef.current;
    const opts = lastRef.current?.opts;
    const won = winner === 0; // le profil local joue toujours le camp 0
    const score = m?.holdScore ?? [0, 0];
    let progress = scorelineHtml(score);
    let p = profileRef.current;

    if (m && opts && p && (mode === "bot" || mode === "hotseat")) {
      const comps = m.teamComps;
      const applied = applyOutcome(p, {
        mode,
        botLevel: mode === "bot" ? opts.botLevel : undefined,
        arena: m.arenaId,
        team: comps.a,
        opp: comps.b,
        won,
        turns: m.turnsPlayed,
        hold: m.holdScore,
      });
      p = applied.profile;
      saveProfile(p);
      updateProfile(p);
      progress += progressHtml(p, applied.xpGained, applied.ratingDelta, applied.leveledTo);
    }

    const label = mode === "bot" ? (won ? "Gagné" : "Perdu") : `Joueur ${winner + 1} gagne`;
    const tone: "win" | "loss" | "neutral" = mode === "bot" ? (won ? "win" : "loss") : "neutral";
    setScreen({
      kind: "result",
      title: label,
      sub: winner === 1 && mode === "bot" ? "Le bot a tenu la zone." : "La zone est à toi.",
      onRematch: () => startLocalMatch(),
      onMenu: () => toMenu(),
      onDownloadReplay: replayDownloader(winner),
      progressHtml: progress,
      tone,
    });
  }

  function progressHtml(p: Profile, xp: number, ratingDelta: number | null, leveledTo: number | null): string {
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

  function showProfile(): void {
    const p = profileRef.current;
    if (!p) {
      toMenu();
      return;
    }
    const lv = levelFromXp(p.xp);
    const rv = ratingView(p);
    const streakLabel =
      p.streak >= 2 ? `série de ${p.streak} victoires` : p.streak <= -2 ? `série de ${-p.streak} défaites` : "";
    const ratingLine = rv.placed
      ? `${rv.tierLabel} · ${rv.rating} (±${rv.rd})`
      : `Non classé · ${rv.placementLeft} partie${rv.placementLeft > 1 ? "s" : ""} avant classement`;
    const tierGauge =
      rv.placed && rv.nextTierLabel
        ? {
            pct: Math.round(rv.tierProgress * 100),
            label: `${rv.tierPointsToNext} point${(rv.tierPointsToNext ?? 0) > 1 ? "s" : ""} vers ${rv.nextTierLabel}`,
          }
        : rv.placed
          ? { pct: 100, label: "Palier maximal par note — l'Élite se joue au classement." }
          : undefined;

    const history: HistoryRow[] = p.history.slice(0, 12).map((h) => {
      const lbl =
        h.mode === "bot"
          ? `vs Bot ${BOT_LABEL[h.botLevel ?? 2]} · ${arenaLabel(h.arena)}`
          : `Hotseat · ${arenaLabel(h.arena)}`;
      const delta =
        h.ratingBefore !== null && h.ratingAfter !== null
          ? `+${h.xpGained} XP · ${h.ratingAfter - h.ratingBefore >= 0 ? "+" : ""}${h.ratingAfter - h.ratingBefore}`
          : `+${h.xpGained} XP`;
      return { won: h.won, label: lbl, score: `${h.hold[0]}–${h.hold[1]}`, delta };
    });

    const su = Session.user();
    const accountLine = su
      ? `Compte PocketBase : ${su.email}`
      : "Pas de compte PocketBase — profil local à ce navigateur uniquement.";

    setScreen({
      kind: "profile",
      view: {
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
        equippedTitle: p.equippedTitle ?? undefined,
        tier: tierGauge,
        history,
      },
      accountLine,
    });
  }

  function showAccount(): void {
    setScreen({ kind: "account", user: Session.user() });
  }

  function renameFlow(): void {
    const p = profileRef.current;
    if (!p) {
      toMenu();
      return;
    }
    setScreen({
      kind: "name",
      initial: p.name,
      onDone: (name) => {
        updateProfile(renameProfile(p, name));
        showProfile();
      },
      onCancel: () => showProfile(),
    });
  }

  function resetFlow(): void {
    clearProfile();
    updateProfile(null);
    setScreen({
      kind: "name",
      initial: "",
      onDone: (name) => {
        const p = freshProfile(name);
        saveProfile(p);
        updateProfile(p);
        toMenu();
      },
    });
  }

  // ---- online -------------------------------------------------------

  function startOnline(o: StartOpts): void {
    teardown();
    const client = new NetClient();
    netRef.current = client;
    let matchId = "";

    const off = client.on((m: ServerMsg) => {
      if (m.t === "paired") {
        matchId = m.matchId;
      } else if (m.t === "draft") {
        setScreen({
          kind: "onlineDraft",
          phase: m.phase,
          pool: m.pool,
          onBan: (hero) => client.send({ t: "ban", matchId, hero }),
          onPick: (team) =>
            client.send({ t: "pick", matchId, team: team as [HeroKind, HeroKind, HeroKind] }),
          onCancel: () => {
            off();
            client.send({ t: "cancel" });
            teardown();
            toMenu();
          },
        });
      } else if (m.t === "matched") {
        off();
        startNetMatch(client, m, o);
      } else if (m.t === "error") {
        off();
        teardown();
        setScreen({ kind: "notice", title: "Connexion perdue", sub: "Le serveur ne répond plus.", onOk: () => toMenu() });
      }
    });

    setScreen({
      kind: "searching",
      onCancel: () => {
        client.send({ t: "cancel" });
        teardown();
        toMenu();
      },
    });

    client
      .connect()
      .then(() => client.send({ t: "queue", setup: { arenaId: o.arenaId, token: Session.token() } }))
      .catch(() => {
        teardown();
        setScreen({
          kind: "notice",
          title: "Serveur injoignable",
          sub: "Lance <code>npm run server</code> puis réessaie.",
          onOk: () => toMenu(),
        });
      });
  }

  function startNetMatch(client: NetClient, matched: Extract<ServerMsg, { t: "matched" }>, o: StartOpts): void {
    const seat = matched.seat;
    const mo: MatchOpts = {
      teamA: [],
      teamB: [],
      arenaId: o.arenaId,
      sides: seat === 0 ? ["human", "remote"] : ["remote", "human"],
      botLevel: 2,
      hud,
      net: { client, matchId: matched.matchId, seat, resumeToken: matched.resumeToken },
      initialState: matched.state,
      onOver: (winner) => {
        netRef.current = null;
        client.close();
        // le serveur a appelé settle-match — resynchronise l'XP de compte si connecté
        void Session.refresh();
        const score = matchRef.current?.holdScore ?? [0, 0];
        setScreen({
          kind: "result",
          title: winner === seat ? "Gagné" : "Perdu",
          sub: winner === seat ? "La zone est à toi." : "L'adversaire a tenu la zone.",
          onRematch: () => startOnline(o),
          onMenu: () => toMenu(),
          onDownloadReplay: replayDownloader(winner),
          progressHtml: scorelineHtml(score),
          tone: winner === seat ? "win" : "loss",
        });
      },
      onDisconnect: () => {
        teardown();
        setScreen({ kind: "notice", title: "Adversaire déconnecté", sub: "", onOk: () => toMenu() });
      },
    };
    startSession({ kind: "match", opts: mo });
    setScreen(null);
  }

  // ---- replays ----------------------------------------------------

  function replayDownloader(winner: 0 | 1): (() => void) | undefined {
    const m = matchRef.current;
    if (!m || m.log.length === 0) return undefined;
    const comps = m.teamComps;
    const arenaId = m.arenaId;
    const log = m.log.slice();
    return () => downloadRecording(makeRecording({ teamA: comps.a, teamB: comps.b, arenaId }, log, winner));
  }

  function pickReplayFile(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        toMenu();
        return;
      }
      try {
        const rec = parseRecording(await file.text());
        teardown();
        startSession({ kind: "replay", rec, onExit: () => toMenu() });
        setScreen(null);
      } catch (e) {
        setScreen({
          kind: "notice",
          title: "Replay illisible",
          sub: String((e as Error).message),
          onOk: () => toMenu(),
        });
      }
    });
    input.click();
  }

  // ---- spectate -----------------------------------------------------

  function startSpectate(): void {
    teardown();
    const client = new NetClient();
    netRef.current = client;
    client
      .connect()
      .then(() => refreshSpectateList(client))
      .catch(() => {
        teardown();
        setScreen({
          kind: "notice",
          title: "Serveur injoignable",
          sub: "Lance <code>npm run server</code> puis réessaie.",
          onOk: () => toMenu(),
        });
      });
  }

  function refreshSpectateList(client: NetClient): void {
    const off = client.on((m: ServerMsg) => {
      if (m.t !== "matchList") return;
      off();
      const rows: SpectateRow[] = m.matches.map((mi) => ({
        matchId: mi.matchId,
        label: `${arenaLabel(mi.arenaId)} · tour ${mi.turn}`,
      }));
      setScreen({
        kind: "spectateList",
        rows,
        onWatch: (matchId) => watchMatch(client, matchId),
        onRefresh: () => refreshSpectateList(client),
        onCancel: () => {
          teardown();
          toMenu();
        },
      });
    });
    client.send({ t: "listMatches" });
  }

  function watchMatch(client: NetClient, matchId: string): void {
    const off = client.on((m: ServerMsg) => {
      if (m.t === "spectating" && m.matchId === matchId) {
        off();
        startSession({
          kind: "spectate",
          client,
          initialState: m.state,
          onExit: () => {
            teardown();
            toMenu();
          },
        });
        setScreen(null);
      } else if (m.t === "error") {
        off();
        teardown();
        setScreen({ kind: "notice", title: "Connexion perdue", sub: "Le serveur ne répond plus.", onOk: () => toMenu() });
      }
    });
    client.send({ t: "spectate", matchId });
  }

  // ---- classement ---------------------------------------------------

  function showRank(): void {
    const user = Session.user();
    if (!user) {
      setScreen({
        kind: "notice",
        title: "Connecte-toi",
        sub: "Le classement suit ton compte PocketBase — connecte-toi depuis ton profil.",
        onOk: () => toMenu(),
      });
      return;
    }
    setScreen({ kind: "rank", loading: true, error: null, seasonName: null, me: null, rows: [] });
    void loadRank(user.id, user.name);
  }

  async function loadRank(userId: string, name: string): Promise<void> {
    try {
      const season = await Leaderboard.activeSeason();
      if (!season) {
        setScreen({ kind: "rank", loading: false, error: null, seasonName: null, me: null, rows: [] });
        return;
      }
      const [me, rows] = await Promise.all([
        Leaderboard.myRating(season.id, userId, name),
        Leaderboard.top(season.id),
      ]);
      setScreen({ kind: "rank", loading: false, error: null, seasonName: season.name, me, rows });
    } catch (e) {
      setScreen({ kind: "rank", loading: false, error: (e as Error).message, seasonName: null, me: null, rows: [] });
    }
  }

  // ---- vestiaire ------------------------------------------------------

  function showLocker(): void {
    const user = Session.user();
    if (!user) {
      setScreen({
        kind: "notice",
        title: "Connecte-toi",
        sub: "Le vestiaire suit ton compte PocketBase — connecte-toi depuis ton profil.",
        onOk: () => toMenu(),
      });
      return;
    }
    setScreen({ kind: "locker", loading: true, error: null, catalog: [], owned: new Set() });
    void loadLocker(user.id);
  }

  async function loadLocker(userId: string): Promise<void> {
    const token = Session.token();
    try {
      const [catalog, owned] = await Promise.all([
        Cosmetics.catalog(),
        token ? Cosmetics.owned(userId, token) : Promise.resolve(new Set<string>()),
      ]);
      setScreen({ kind: "locker", loading: false, error: null, catalog, owned });
    } catch (e) {
      setScreen({ kind: "locker", loading: false, error: (e as Error).message, catalog: [], owned: new Set() });
    }
  }

  function equip(kind: "title" | "border", slug: string | null): void {
    const p = profileRef.current;
    if (!p) return;
    updateProfile(equipCosmetic(p, kind, slug));
    showLocker();
  }

  // ---- rendu ----------------------------------------------------

  function renderSession() {
    if (!session) return null;
    const { seq, spec } = session;
    switch (spec.kind) {
      case "match":
        return <MatchSession key={seq} host={host} opts={spec.opts} onReady={(m) => (matchRef.current = m)} />;
      case "replay":
        return <ReplaySession key={seq} host={host} rec={spec.rec} hud={hud} onExit={spec.onExit} />;
      case "spectate":
        return (
          <SpectateSession
            key={seq}
            host={host}
            client={spec.client}
            initialState={spec.initialState}
            hud={hud}
            onExit={spec.onExit}
          />
        );
    }
  }

  function renderScreen() {
    if (!screen) return null;
    switch (screen.kind) {
    case "menu":
      return (
        <MenuScreen
          chip={screen.chip}
          onStart={onStart}
          onReplay={pickReplayFile}
          onProfile={showProfile}
          onCodex={() => setScreen({ kind: "codex" })}
          onSpectate={startSpectate}
          onRank={showRank}
          onLocker={showLocker}
          onCredits={() =>
            setScreen({
              kind: "notice",
              title: "Crédits",
              sub: `Musique : <b>Kevin MacLeod</b> (<a href="https://incompetech.com" target="_blank" rel="noreferrer">incompetech.com</a>), licence Creative Commons BY 3.0.<br/>
                « Wallpaper » (menu) · « Local Forecast » (Carrefour) · « Industrial Cinematic » (Fonderie) · « Cheery Monday » (Flipper).`,
              onOk: () => toMenu(),
            })
          }
        />
      );
    case "name":
      return <NameScreen initial={screen.initial} onDone={screen.onDone} onCancel={screen.onCancel} />;
    case "profile":
      return (
        <ProfileScreen
          view={screen.view}
          onBack={toMenu}
          onRename={renameFlow}
          onReset={resetFlow}
          onAccount={showAccount}
          accountLine={screen.accountLine}
        />
      );
    case "account":
      return (
        <AccountScreen
          user={screen.user}
          onLogin={(email, password) => Session.login(email, password).then(() => {})}
          onRegister={(email, password, name) => Session.register(email, password, name).then(() => {})}
          onLogout={() => Session.logout()}
          onBack={showProfile}
        />
      );
    case "codex":
      return <CodexScreen onBack={toMenu} />;
    case "banPick":
      return <BanPickScreen hotseat={screen.hotseat} onDone={screen.onDone} />;
    case "onlineDraft":
      return (
        <OnlineDraftScreen
          phase={screen.phase}
          pool={screen.pool}
          onBan={screen.onBan}
          onPick={screen.onPick}
          onCancel={screen.onCancel}
        />
      );
    case "searching":
      return <SearchingScreen onCancel={screen.onCancel} />;
    case "notice":
      return <NoticeScreen title={screen.title} sub={screen.sub} onOk={screen.onOk} />;
    case "result":
      return (
        <ResultScreen
          title={screen.title}
          sub={screen.sub}
          onRematch={screen.onRematch}
          onMenu={screen.onMenu}
          onDownloadReplay={screen.onDownloadReplay}
          progressHtml={screen.progressHtml}
          tone={screen.tone}
        />
      );
    case "spectateList":
      return (
        <SpectateListScreen
          rows={screen.rows}
          onWatch={screen.onWatch}
          onRefresh={screen.onRefresh}
          onCancel={screen.onCancel}
        />
      );
    case "rank":
      return (
        <RankScreen
          loading={screen.loading}
          error={screen.error}
          seasonName={screen.seasonName}
          me={screen.me}
          rows={screen.rows}
          onRefresh={showRank}
          onBack={toMenu}
        />
      );
    case "locker":
      return (
        <LockerScreen
          loading={screen.loading}
          error={screen.error}
          catalog={screen.catalog}
          owned={screen.owned}
          equippedTitle={profile?.equippedTitle ?? null}
          equippedBorder={profile?.equippedBorder ?? null}
          onEquip={equip}
          onBack={toMenu}
        />
      );
    }
  }

  return (
    <>
      {renderSession()}
      {renderScreen()}
    </>
  );
}
