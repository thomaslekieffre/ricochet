import { HEROES, ROSTER } from "../engine/index";
import type { HeroKind } from "../engine/index";
import { isNameValid, sanitizeName } from "../lib/profile";

const overlay = (): HTMLElement => {
  const el = document.getElementById("overlay");
  if (!el) throw new Error("#overlay introuvable");
  return el;
};

export function hideOverlay(): void {
  const el = overlay();
  el.innerHTML = "";
  el.hidden = true;
}

function show(html: string): HTMLElement {
  const el = overlay();
  el.innerHTML = html;
  el.hidden = false;
  return el;
}

/** Échappe le texte fourni par le joueur (pseudo) avant injection HTML. */
export function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

const ARCH_FR: Record<string, string> = {
  brawler: "Brawler",
  dasher: "Dasher",
  sniper: "Sniper",
  mage: "Mage",
};

export interface StartOpts {
  mode: "bot" | "hotseat" | "online";
  botLevel: 1 | 2 | 3;
  arenaId: string;
}

export interface MenuChip {
  name: string;
  level: number;
  line: string;
}

// ---- menu : un lanceur, pas un formulaire -----------------------------

export function menuScreen(
  chip: MenuChip | null,
  onStart: (o: StartOpts) => void,
  onReplay: () => void,
  onProfile: () => void,
  onCodex: () => void,
): void {
  const el = show(`
    <div class="screen menu">
      ${
        chip
          ? `<button class="pchip" id="pchip" title="Ton profil">
               <span class="pn">${esc(chip.name)}</span>
               <span class="pl">Nv ${chip.level}</span>
               <span class="pd">${esc(chip.line)}</span>
             </button>`
          : `<span class="pchip pchip-ghost">Ricochet</span>`
      }

      <div class="launch">
        <button class="bigplay" id="play">Jouer</button>
        <p class="launch-sub">Mode Contrôle — tiens la zone centrale, premier à 15</p>
      </div>

      <div class="setup">
        <div class="opt">
          <span class="lbl">Adversaire</span>
          <div class="seg" data-group="mode">
            <button data-v="bot" class="on">Bot</button>
            <button data-v="hotseat">Hotseat</button>
            <button data-v="online">En ligne</button>
          </div>
        </div>
        <div class="opt" data-only="bot">
          <span class="lbl">Niveau du bot</span>
          <div class="seg" data-group="level">
            <button data-v="1">Souple</button>
            <button data-v="2" class="on">Correct</button>
            <button data-v="3">Coriace</button>
          </div>
        </div>
        <div class="opt">
          <span class="lbl">Arène</span>
          <div class="seg" data-group="arena">
            <button data-v="carrefour" class="on">Carrefour</button>
            <button data-v="fonderie">Fonderie</button>
            <button data-v="flipper">Flipper</button>
          </div>
        </div>
        <p class="note" data-only="online">
          Il faut un serveur de match en route : <code>npm run server</code>.
          L'arène choisie s'applique si tu es placé en siège&nbsp;1.
        </p>
      </div>

      <div class="menu-foot">
        <button class="linkbtn" id="codex">Voir les héros</button>
        <button class="linkbtn" id="replay">Revoir un replay</button>
      </div>
    </div>
  `);

  el.querySelector("#replay")!.addEventListener("click", () => {
    hideOverlay();
    onReplay();
  });
  el.querySelector("#codex")!.addEventListener("click", () => {
    hideOverlay();
    onCodex();
  });
  el.querySelector("#pchip")?.addEventListener("click", () => {
    hideOverlay();
    onProfile();
  });

  const pick: Record<string, string> = { mode: "bot", level: "2", arena: "carrefour" };
  const syncOnly = (): void => {
    el.querySelectorAll<HTMLElement>("[data-only]").forEach((o) => {
      o.hidden = o.dataset.only !== pick.mode;
    });
  };
  el.querySelectorAll<HTMLElement>(".seg").forEach((seg) => {
    const group = seg.dataset.group!;
    seg.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", () => {
        seg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
        pick[group] = b.dataset.v!;
        syncOnly();
      });
    });
  });
  syncOnly();

  el.querySelector("#play")!.addEventListener("click", () => {
    hideOverlay();
    onStart({
      mode: pick.mode as StartOpts["mode"],
      botLevel: Number(pick.level) as 1 | 2 | 3,
      arenaId: pick.arena ?? "carrefour",
    });
  });
}

const PRESETS: HeroKind[][] = [
  ["ram", "sling", "boulder"],
  ["hook", "prism", "comet"],
  ["boulder", "prism", "sling"],
  ["ram", "hook", "comet"],
];

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
 * Chaque camp bannit 1 héros du pool commun, puis compose 3 héros parmi les 4
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

/** Draft en ligne : un seul camp compose 3 héros (pas de ban). */
export function draftScreen(
  needTwo: boolean,
  onDone: (teamA: HeroKind[], teamB: HeroKind[]) => void,
): void {
  let phase: 0 | 1 = 0;
  const teams: [HeroKind[], HeroKind[]] = [[], []];

  const render = (): void => {
    const cur = teams[phase];
    const head = !needTwo ? "Ta compo" : `Joueur ${phase + 1}`;
    const el = show(`
      <div class="screen draft">
        <h2>${head}</h2>
        <p class="sub">Choisis 3 héros. <span id="count">${cur.length}/3</span></p>
        <div class="versus solo">
          ${teamPanel("a", head, null, cur, true, true)}
        </div>
        <div class="pool">${ROSTER.map((h) =>
          poolCard(h, {
            on: cur.includes(h),
            badge: cur.includes(h) ? cur.indexOf(h) + 1 : undefined,
          }),
        ).join("")}</div>
        <button class="cta" id="go" ${cur.length === 3 ? "" : "disabled"}>
          ${!needTwo ? "Lancer le match" : phase === 0 ? "Au Joueur 2" : "Lancer le match"}
        </button>
      </div>
    `);
    el.querySelectorAll<HTMLElement>(".pcard").forEach((c) => {
      c.addEventListener("click", () => {
        const h = c.dataset.h as HeroKind;
        const i = cur.indexOf(h);
        if (i >= 0) cur.splice(i, 1);
        else if (cur.length < 3) cur.push(h);
        render();
      });
    });
    el.querySelector("#go")!.addEventListener("click", () => {
      if (cur.length !== 3) return;
      if (needTwo && phase === 0) {
        phase = 1;
        render();
        return;
      }
      hideOverlay();
      const a = teams[0];
      const b = needTwo ? teams[1] : PRESETS[Math.floor(Math.random() * PRESETS.length)]!;
      onDone(a, b);
    });
  };
  render();
}

/** Codex : les six fiches, dans les mots exacts de la barre d'action en match. */
export function codexScreen(onBack: () => void): void {
  const cards = ROSTER.map((h) => {
    const d = HEROES[h];
    return `<div class="cx-card">
      <div class="cx-top">
        <span class="cx-name">${d.name}</span>
        <span class="pc-arch a-${d.archetype}">${ARCH_FR[d.archetype]}</span>
      </div>
      <p class="cx-row"><span class="cx-tag">de base</span>${d.base}</p>
      <p class="cx-row cx-ability">
        <kbd>A</kbd><b>${d.ability.name}</b>
        <span class="cx-acost">${d.abilityCost} Momentum</span>
        <span class="cx-eff">${d.ability.effect}</span>
      </p>
      <p class="cx-row"><span class="cx-tag">passif</span>${d.passive.name} — ${d.passive.effect}</p>
    </div>`;
  }).join("");

  const el = show(`
    <div class="screen wide codex">
      <h2>Les héros</h2>
      <p class="sub">1 héros bouge par tour. Sa <b>capacité</b> se déclenche avec <kbd>A</kbd>
        et coûte du Momentum : +1 par tour, plafond 5, tu démarres à 2.</p>
      <div class="codex-grid">${cards}</div>
      <button class="cta" id="back">Retour</button>
    </div>
  `);
  el.querySelector("#back")!.addEventListener("click", () => {
    hideOverlay();
    onBack();
  });
}

// ---- profil ----------------------------------------------------------

export function nameScreen(
  initial: string,
  onDone: (name: string) => void,
  onCancel?: () => void,
): void {
  const el = show(`
    <div class="screen">
      <h2>Ton pseudo</h2>
      <p class="sub">3 à 16 caractères. Il identifie ton profil sur ce navigateur.</p>
      <input id="pname" class="tin" maxlength="16" autocomplete="off"
        spellcheck="false" value="${esc(initial)}" placeholder="ex. Zoe" />
      <p class="sub err" id="perr">&nbsp;</p>
      <div class="rowbtns">
        <button class="cta" id="ok">Valider</button>
        ${onCancel ? `<button class="cta ghost" id="cancel">Annuler</button>` : ""}
      </div>
    </div>
  `);
  const input = el.querySelector<HTMLInputElement>("#pname")!;
  const err = el.querySelector("#perr")!;
  const submit = (): void => {
    if (!isNameValid(input.value)) {
      err.textContent = "Entre un pseudo de 3 à 16 caractères.";
      return;
    }
    hideOverlay();
    onDone(sanitizeName(input.value));
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  el.querySelector("#ok")!.addEventListener("click", submit);
  el.querySelector("#cancel")?.addEventListener("click", () => {
    hideOverlay();
    onCancel?.();
  });
  setTimeout(() => input.focus(), 0);
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
  history: HistoryRow[];
}

export function profileScreen(
  v: ProfileView,
  onBack: () => void,
  onRename: () => void,
  onReset: () => void,
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

      <div class="xpbar"><span data-fill="${pct}" style="width:0"></span></div>
      <p class="sub" style="margin:.35rem 0 1.1rem">${v.into} / ${v.span} vers le niveau ${v.level + 1}</p>

      <div class="statrow">
        <div><b>${v.games}</b><span>parties</span></div>
        <div><b>${v.wins}–${v.losses}</b><span>V–D</span></div>
        <div><b>${v.winrate}%</b><span>winrate</span></div>
      </div>

      <h3 class="hh">Derniers matchs</h3>
      <div class="hlist">${rows}</div>

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
  const el = show(`
    <div class="screen curtain">
      <p class="curtain-to">au tour de</p>
      <h2>${text}</h2>
      <button class="cta" id="c">Continuer</button>
    </div>
  `);
  el.querySelector("#c")!.addEventListener("click", () => {
    hideOverlay();
    onGo();
  });
}

export function searchingScreen(onCancel: () => void): void {
  const el = show(`
    <div class="screen">
      <h2>Recherche d'un adversaire…</h2>
      <p class="sub">On te place dès qu'un joueur est disponible.</p>
      <button class="cta ghost" id="cancel">Annuler</button>
    </div>
  `);
  el.querySelector("#cancel")!.addEventListener("click", () => {
    hideOverlay();
    onCancel();
  });
}

export function noticeScreen(title: string, sub: string, onOk: () => void): void {
  const el = show(`
    <div class="screen">
      <h2>${title}</h2>
      <p class="sub">${sub}</p>
      <button class="cta" id="ok">Retour au menu</button>
    </div>
  `);
  el.querySelector("#ok")!.addEventListener("click", () => {
    hideOverlay();
    onOk();
  });
}
