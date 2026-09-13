import { createElement } from "react";
import { HEROES, ROSTER } from "../engine/index";
import type { HeroKind } from "../engine/index";
import { hideOverlay, show, showReact } from "../ui/mount";
import { ARCH_FR } from "../ui/labels";
import { CodexScreen } from "../ui/screens/CodexScreen";
import { CurtainScreen } from "../ui/screens/CurtainScreen";
import { MenuScreen } from "../ui/screens/MenuScreen";
import type { MenuChip } from "../ui/screens/MenuScreen";
import { NameScreen } from "../ui/screens/NameScreen";
import { NoticeScreen } from "../ui/screens/NoticeScreen";
import { SearchingScreen } from "../ui/screens/SearchingScreen";
import { SpectateListScreen } from "../ui/screens/SpectateListScreen";
import type { SpectateRow } from "../ui/screens/SpectateListScreen";

export { hideOverlay };
export type { SpectateRow };

/** Échappe le texte fourni par le joueur (pseudo) avant injection HTML. */
export function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export interface StartOpts {
  mode: "bot" | "hotseat" | "online";
  botLevel: 1 | 2 | 3;
  arenaId: string;
}

export type { MenuChip };

// ---- menu : un lanceur, pas un formulaire -----------------------------

export function menuScreen(
  chip: MenuChip | null,
  onStart: (o: StartOpts) => void,
  onReplay: () => void,
  onProfile: () => void,
  onCodex: () => void,
  onSpectate: () => void,
): void {
  showReact(
    createElement(MenuScreen, {
      chip,
      onStart: (o: StartOpts) => {
        hideOverlay();
        onStart(o);
      },
      onReplay: () => {
        hideOverlay();
        onReplay();
      },
      onProfile: () => {
        hideOverlay();
        onProfile();
      },
      onCodex: () => {
        hideOverlay();
        onCodex();
      },
      onSpectate: () => {
        hideOverlay();
        onSpectate();
      },
    }),
  );
}

/** Une carte du pool de draft — nom, archétype, phrase, ligne de capacité. */
function poolCard(h: HeroKind, opts: { on?: boolean; locked?: boolean; badge?: number }): string {
  const d = HEROES[h];
  const cls = ["pcard", opts.on ? "on" : "", opts.locked ? "locked" : ""].join(" ").trim();
  return `<button class="${cls}" data-h="${h}" ${opts.locked ? "disabled" : ""}>
    ${opts.badge ? `<span class="pc-badge">${opts.badge}</span>` : ""}
    <span class="pc-name">${d.name}</span>
    <span class="pc-arch a-${d.archetype}">${ARCH_FR[d.archetype]}</span>
    <span class="pc-blurb">${d.blurb}</span>
    <span class="pc-kit"><kbd>A</kbd>${d.ability.name} · ${d.abilityCost}</span>
  </button>`;
}

/** Le panneau d'un camp dans le tableau de draft. */
function teamPanel(
  sideCls: "a" | "b",
  head: string,
  ban: HeroKind | null,
  team: HeroKind[],
  reveal: boolean,
  active: boolean,
): string {
  const slots = [0, 1, 2]
    .map((i) => {
      const h = team[i];
      const filled = reveal && h;
      return `<li class="vslot ${filled ? "set" : ""}">${filled ? HEROES[h!].name : ""}</li>`;
    })
    .join("");
  return `<div class="vteam ${sideCls} ${active ? "active" : ""}">
    <span class="vhead">${head}</span>
    <span class="vban ${ban ? "set" : ""}">${ban ? `banni : ${HEROES[ban].name}` : "aucun ban"}</span>
    <ol class="vslots">${slots}</ol>
  </div>`;
}

/**
 * Draft ban/pick pour les modes locaux (docs/PHASES.md P6, version hotseat/bot).
 * Chaque camp bannit 1 héros du pool commun, puis compose 3 héros parmi les
 * restants (les compos peuvent se recouper). Le bot bannit et compose au hasard.
 */
export function banPickScreen(
  hotseat: boolean,
  onDone: (teamA: HeroKind[], teamB: HeroKind[]) => void,
): void {
  const bans: [HeroKind | null, HeroKind | null] = [null, null];
  const teams: [HeroKind[], HeroKind[]] = [[], []];
  const sideName = (s: 0 | 1): string =>
    hotseat ? `Joueur ${s + 1}` : s === 0 ? "Toi" : "Bot";
  const alive = (): HeroKind[] => ROSTER.filter((h) => h !== bans[0] && h !== bans[1]);
  const pickRandom = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]!;

  const botCompo = (): HeroKind[] => {
    const pool = alive().slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, 3);
  };

  type Step = "ban0" | "ban1" | "pick0" | "pick1";
  const STEPS: Step[] = ["ban0", "ban1", "pick0", "pick1"];

  const finish = (): void => {
    hideOverlay();
    onDone(teams[0], teams[1]);
  };

  const advance = (step: Step): void => {
    if (step === "ban0") render("ban1");
    else if (step === "ban1") render("pick0");
    else if (step === "pick0") render("pick1");
    else finish();
  };

  const render = (step: Step): void => {
    // le bot joue ses étapes tout seul
    if (!hotseat && step === "ban1") {
      bans[1] = pickRandom(ROSTER.filter((h) => h !== bans[0]));
      render("pick0");
      return;
    }
    if (!hotseat && step === "pick1") {
      teams[1] = botCompo();
      finish();
      return;
    }

    const side: 0 | 1 = step === "ban0" || step === "pick0" ? 0 : 1;
    const isBan = step === "ban0" || step === "ban1";
    const cur = teams[side];
    const otherBan = bans[side === 0 ? 1 : 0];
    const isLocked = (h: HeroKind): boolean =>
      isBan ? h === otherBan : h === bans[0] || h === bans[1];

    const title = isBan
      ? `${sideName(side)} — bannis un héros`
      : `${sideName(side)} — ta compo`;
    const sub = isBan
      ? "Il sort de la sélection pour les deux camps."
      : `Choisis 3 héros parmi les 4 restants. <span id="count">${cur.length}/3</span>`;

    const stepTrack = STEPS.map((s) => {
      const done = STEPS.indexOf(s) < STEPS.indexOf(step);
      const now = s === step;
      const lbl = s.startsWith("ban") ? "Ban" : "Compo";
      return `<i class="ds ${done ? "done" : ""} ${now ? "on" : ""}">${lbl}</i>`;
    }).join("");

    // révèle une compo seulement si elle est bouclée ou si c'est le camp actif
    const revealA = teams[0].length === 3 || side === 0;
    const revealB = teams[1].length === 3 || side === 1;

    const cards = ROSTER.map((h) => {
      const locked = isLocked(h);
      const on = isBan ? h === bans[side] : cur.includes(h);
      const badge = !isBan && cur.includes(h) ? cur.indexOf(h) + 1 : undefined;
      return poolCard(h, { on, locked, badge });
    }).join("");

    const ready = isBan ? bans[side] !== null : cur.length === 3;
    const nextLabel = isBan
      ? hotseat && step === "ban0"
        ? "Ban du Joueur 2"
        : "Passer aux compos"
      : hotseat && step === "pick0"
        ? "Au Joueur 2"
        : "Lancer le match";

    const el = show(`
      <div class="screen draft">
        <div class="draft-steps">${stepTrack}</div>
        <h2>${title}</h2>
        <p class="sub">${sub}</p>

        <div class="versus">
          ${teamPanel("a", sideName(0), bans[0], teams[0], revealA, side === 0)}
          <span class="vs">vs</span>
          ${teamPanel("b", sideName(1), bans[1], teams[1], revealB, side === 1)}
        </div>

        <div class="pool">${cards}</div>
        <button class="cta" id="go" ${ready ? "" : "disabled"}>${nextLabel}</button>
      </div>
    `);

    el.querySelectorAll<HTMLElement>(".pcard").forEach((c) => {
      if (c.hasAttribute("disabled")) return;
      c.addEventListener("click", () => {
        const h = c.dataset.h as HeroKind;
        if (isBan) {
          bans[side] = h;
        } else {
          const i = cur.indexOf(h);
          if (i >= 0) cur.splice(i, 1);
          else if (cur.length < 3) cur.push(h);
        }
        render(step);
      });
    });
    el.querySelector("#go")!.addEventListener("click", () => {
      if (isBan ? bans[side] === null : cur.length !== 3) return;
      advance(step);
    });
  };

  render("ban0");
}

/**
 * Draft en ligne (docs/PHASES.md P6) : pilotée par le serveur — un `draft`
 * (ban, puis pick) à la fois, un seul appel par message reçu. Une fois le
 * choix envoyé, l'écran se fige sur "en attente de l'adversaire" jusqu'au
 * prochain message serveur (`draft` de la phase suivante, ou `matched`).
 */
export function onlineDraftScreen(
  phase: "ban" | "pick",
  pool: HeroKind[],
  onBan: (hero: HeroKind) => void,
  onPick: (team: HeroKind[]) => void,
  onCancel: () => void,
): void {
  const picked: HeroKind[] = [];
  let submitted = false;

  const render = (): void => {
    const head = phase === "ban" ? "Bannis un héros" : "Compose ton équipe";
    const sub =
      phase === "ban"
        ? "Il sort de la sélection pour les deux camps."
        : `Choisis 3 héros parmi les ${pool.length} restants.`;
    const el = show(`
      <div class="screen draft">
        <h2>${head}</h2>
        <p class="sub">${sub}</p>
        ${phase === "pick" ? `<p class="sub">${picked.length}/3</p>` : ""}
        <div class="pool">${pool
          .map((h) =>
            poolCard(h, {
              on: picked.includes(h),
              locked: submitted,
              badge: phase === "pick" && picked.includes(h) ? picked.indexOf(h) + 1 : undefined,
            }),
          )
          .join("")}</div>
        ${phase === "pick" ? `<button class="cta" id="go" ${picked.length === 3 && !submitted ? "" : "disabled"}>Valider</button>` : ""}
        ${submitted ? `<p class="sub">En attente de l'adversaire…</p>` : ""}
        <button class="linkbtn" id="cancel">Annuler</button>
      </div>
    `);
    if (!submitted) {
      el.querySelectorAll<HTMLElement>(".pcard").forEach((c) => {
        c.addEventListener("click", () => {
          const h = c.dataset.h as HeroKind;
          if (phase === "ban") {
            submitted = true;
            render();
            onBan(h);
            return;
          }
          const i = picked.indexOf(h);
          if (i >= 0) picked.splice(i, 1);
          else if (picked.length < 3) picked.push(h);
          render();
        });
      });
      el.querySelector("#go")?.addEventListener("click", () => {
        if (picked.length !== 3) return;
        submitted = true;
        render();
        onPick(picked);
      });
    }
    el.querySelector("#cancel")!.addEventListener("click", onCancel);
  };
  render();
}

/** Codex : les six fiches, dans les mots exacts de la barre d'action en match. */
export function codexScreen(onBack: () => void): void {
  showReact(
    createElement(CodexScreen, {
      onBack: () => {
        hideOverlay();
        onBack();
      },
    }),
  );
}

// ---- profil ----------------------------------------------------------

export function nameScreen(
  initial: string,
  onDone: (name: string) => void,
  onCancel?: () => void,
): void {
  showReact(
    createElement(NameScreen, {
      initial,
      onDone: (name: string) => {
        hideOverlay();
        onDone(name);
      },
      onCancel: onCancel
        ? () => {
            hideOverlay();
            onCancel();
          }
        : undefined,
    }),
  );
}

export interface HistoryRow {
  won: boolean;
  label: string;
  score: string;
  delta: string;
}

export interface ProfileView {
  name: string;
  level: number;
  into: number;
  span: number;
  xp: number;
  games: number;
  wins: number;
  losses: number;
  winrate: number;
  streakLabel: string;
  ratingLine: string;
  /** Jauge de progression dans le palier classé courant ; absente si non classé. */
  tier?: { pct: number; label: string };
  history: HistoryRow[];
}

export function profileScreen(
  v: ProfileView,
  onBack: () => void,
  onRename: () => void,
  onReset: () => void,
  onAccount: () => void,
  accountLine: string,
): void {
  const pct = Math.round((v.into / v.span) * 100);
  const rows =
    v.history.length === 0
      ? `<p class="sub">Aucune partie jouée. Lance un match.</p>`
      : v.history
          .map(
            (h) => `<div class="hrow ${h.won ? "w" : "l"}">
              <span class="hres">${h.won ? "V" : "D"}</span>
              <span class="hlab">${esc(h.label)}</span>
              <span class="hsc">${esc(h.score)}</span>
              <span class="hdl">${esc(h.delta)}</span>
            </div>`,
          )
          .join("");

  const el = show(`
    <div class="screen wide profile">
      <div class="pbig">
        <span class="pbig-name">${esc(v.name)}</span>
        <span class="pbig-lv">Nv ${v.level}</span>
      </div>
      <p class="ratingline">${esc(v.ratingLine)}</p>
      <p class="sub">${v.xp} XP total${v.streakLabel ? ` · ${v.streakLabel}` : ""}</p>

      ${
        v.tier
          ? `<div class="xpbar tierbar"><span data-fill="${v.tier.pct}" style="width:0"></span></div>
      <p class="sub" style="margin:.35rem 0 1.1rem">${esc(v.tier.label)}</p>`
          : ""
      }

      <div class="xpbar"><span data-fill="${pct}" style="width:0"></span></div>
      <p class="sub" style="margin:.35rem 0 1.1rem">${v.into} / ${v.span} vers le niveau ${v.level + 1}</p>

      <div class="statrow">
        <div><b>${v.games}</b><span>parties</span></div>
        <div><b>${v.wins}–${v.losses}</b><span>V–D</span></div>
        <div><b>${v.winrate}%</b><span>winrate</span></div>
      </div>

      <h3 class="hh">Derniers matchs</h3>
      <div class="hlist">${rows}</div>

      <p class="sub" style="margin-top:1.2rem">${esc(accountLine)}</p>
      <div class="rowbtns">
        <button class="cta ghost" id="account">Compte PocketBase</button>
      </div>

      <div class="rowbtns" style="margin-top:1.2rem">
        <button class="cta ghost" id="rename">Changer de pseudo</button>
        <button class="cta ghost danger" id="reset">Réinitialiser</button>
      </div>
      <button class="cta" id="back" style="margin-top:0.7rem">Retour</button>
    </div>
  `);

  animateBars(el);

  el.querySelector("#back")!.addEventListener("click", () => {
    hideOverlay();
    onBack();
  });
  el.querySelector("#account")!.addEventListener("click", () => {
    hideOverlay();
    onAccount();
  });
  el.querySelector("#rename")!.addEventListener("click", () => {
    hideOverlay();
    onRename();
  });
  const reset = el.querySelector<HTMLButtonElement>("#reset")!;
  let armed = false;
  let armTimer = 0;
  reset.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      reset.textContent = "Confirmer la remise à zéro";
      armTimer = window.setTimeout(() => {
        armed = false;
        reset.textContent = "Réinitialiser";
      }, 3000);
      return;
    }
    window.clearTimeout(armTimer);
    hideOverlay();
    onReset();
  });
}

/** Remplit toutes les jauges `.xpbar span[data-fill]` du conteneur (anim au montage). */
function animateBars(el: HTMLElement): void {
  const bars = el.querySelectorAll<HTMLElement>(".xpbar span[data-fill]");
  requestAnimationFrame(() => {
    bars.forEach((b) => {
      b.style.width = `${b.dataset.fill}%`;
    });
  });
}

export function resultScreen(
  title: string,
  sub: string,
  onRematch: () => void,
  onMenu: () => void,
  onDownloadReplay?: () => void,
  progressHtml?: string,
  tone: "win" | "loss" | "neutral" = "neutral",
): void {
  const el = show(`
    <div class="screen result" data-tone="${tone}">
      <p class="outcome">${title}</p>
      <p class="sub">${sub}</p>
      ${progressHtml ?? ""}
      <div class="rowbtns">
        <button class="cta" id="again">Rejouer</button>
        <button class="cta ghost" id="menu">Menu</button>
      </div>
      ${onDownloadReplay ? `<button class="linkbtn" id="dl" style="margin-top:0.9rem">Télécharger le replay</button>` : ""}
    </div>
  `);
  animateBars(el);
  el.querySelector("#again")!.addEventListener("click", () => {
    hideOverlay();
    onRematch();
  });
  el.querySelector("#menu")!.addEventListener("click", () => {
    hideOverlay();
    onMenu();
  });
  el.querySelector("#dl")?.addEventListener("click", () => onDownloadReplay?.());
}

export function curtain(text: string, onGo: () => void): void {
  showReact(
    createElement(CurtainScreen, {
      text,
      onGo: () => {
        hideOverlay();
        onGo();
      },
    }),
  );
}

export function searchingScreen(onCancel: () => void): void {
  showReact(
    createElement(SearchingScreen, {
      onCancel: () => {
        hideOverlay();
        onCancel();
      },
    }),
  );
}

/** Liste des matchs en direct (docs/PHASES.md P6). Rafraîchissable, lecture seule. */
export function spectateListScreen(
  rows: SpectateRow[],
  onWatch: (matchId: string) => void,
  onRefresh: () => void,
  onCancel: () => void,
): void {
  showReact(
    createElement(SpectateListScreen, {
      rows,
      onWatch: (matchId: string) => {
        hideOverlay();
        onWatch(matchId);
      },
      onRefresh,
      onCancel: () => {
        hideOverlay();
        onCancel();
      },
    }),
  );
}

// ---- compte PocketBase (docs/PHASES.md P4) ----------------------------

export interface AccountUser {
  email: string;
  name: string;
  account_xp: number;
}

/**
 * Écran connexion / inscription / déconnexion contre PocketBase
 * (`src/net/session.ts`). Purement DOM, ne touche jamais l'API directement —
 * `onLogin`/`onRegister` font l'appel réseau et relancent l'écran en cas
 * d'erreur (message renvoyé par `AuthError`).
 */
export function accountScreen(
  user: AccountUser | null,
  onLogin: (email: string, password: string) => Promise<void>,
  onRegister: (email: string, password: string, name: string) => Promise<void>,
  onLogout: () => void,
  onBack: () => void,
): void {
  let mode: "login" | "register" = "login";
  let error = "";
  let busy = false;

  const render = (): void => {
    if (user) {
      const el = show(`
        <div class="screen">
          <h2>Ton compte</h2>
          <p class="sub">Connecté en tant que <b>${esc(user.name || user.email)}</b></p>
          <p class="sub">${esc(user.email)} · ${user.account_xp} XP de compte</p>
          <div class="rowbtns" style="margin-top:1.1rem">
            <button class="cta ghost danger" id="logout">Se déconnecter</button>
          </div>
          <button class="cta" id="back" style="margin-top:0.7rem">Retour</button>
        </div>
      `);
      el.querySelector("#logout")!.addEventListener("click", () => {
        onLogout();
        user = null;
        render();
      });
      el.querySelector("#back")!.addEventListener("click", () => {
        hideOverlay();
        onBack();
      });
      return;
    }

    const el = show(`
      <div class="screen">
        <h2>${mode === "login" ? "Se connecter" : "Créer un compte"}</h2>
        <p class="sub">Compte PocketBase — synchronise ta note classée entre navigateurs.
          Jouer sans compte reste possible (bot, hotseat, en ligne non identifié).</p>
        ${mode === "register" ? `<input id="aname" class="tin" maxlength="16" autocomplete="username" spellcheck="false" placeholder="Pseudo" />` : ""}
        <input id="aemail" class="tin" type="email" autocomplete="email" spellcheck="false" placeholder="Email" style="margin-top:0.5rem" />
        <input id="apass" class="tin" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" placeholder="Mot de passe" style="margin-top:0.5rem" />
        <p class="sub err" id="aerr">${esc(error)}&nbsp;</p>
        <div class="rowbtns">
          <button class="cta" id="go" ${busy ? "disabled" : ""}>${busy ? "…" : mode === "login" ? "Se connecter" : "Créer le compte"}</button>
          <button class="cta ghost" id="back">Retour</button>
        </div>
        <button class="linkbtn" id="swap" style="margin-top:0.9rem">${mode === "login" ? "Pas de compte ? En créer un" : "Déjà un compte ? Se connecter"}</button>
      </div>
    `);

    const emailIn = el.querySelector<HTMLInputElement>("#aemail")!;
    const passIn = el.querySelector<HTMLInputElement>("#apass")!;
    const nameIn = el.querySelector<HTMLInputElement>("#aname");

    const submit = async (): Promise<void> => {
      const email = emailIn.value.trim();
      const password = passIn.value;
      if (!email || !password) {
        error = "Email et mot de passe requis.";
        render();
        return;
      }
      busy = true;
      error = "";
      render();
      try {
        if (mode === "login") {
          await onLogin(email, password);
        } else {
          const name = nameIn?.value.trim() || email.split("@")[0]!;
          await onRegister(email, password, name);
        }
        hideOverlay();
        onBack();
      } catch (e) {
        busy = false;
        error = (e as Error).message || "Échec — vérifie tes identifiants.";
        render();
      }
    };

    el.querySelector("#go")!.addEventListener("click", () => void submit());
    passIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void submit();
    });
    el.querySelector("#swap")!.addEventListener("click", () => {
      mode = mode === "login" ? "register" : "login";
      error = "";
      render();
    });
    el.querySelector("#back")!.addEventListener("click", () => {
      hideOverlay();
      onBack();
    });
    setTimeout(() => (nameIn ?? emailIn).focus(), 0);
  };

  render();
}

export function noticeScreen(title: string, sub: string, onOk: () => void): void {
  showReact(
    createElement(NoticeScreen, {
      title,
      sub,
      onOk: () => {
        hideOverlay();
        onOk();
      },
    }),
  );
}
