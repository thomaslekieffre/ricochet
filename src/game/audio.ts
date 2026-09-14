/** Tiny synthesized SFX + music — no asset files. Created lazily on first user gesture. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let muted = false;

/** Contexte + bus partagés, créés une seule fois (réutilisés par `music.ts`). */
function graph(): { ctx: AudioContext; master: GainNode; music: GainNode } | null {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.32; // pistes réelles déjà mixées fort — reste sous les bruitages
      musicGain.connect(master);
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { ctx, master: master!, music: musicGain! };
}

function ac(): AudioContext | null {
  return graph()?.ctx ?? null;
}

/** Contexte audio partagé, pour le séquenceur de `music.ts`. */
export function audioContext(): AudioContext | null {
  return ac();
}

/** Bus dédié à la musique (volume propre, coupé par le même mute que les SFX). */
export function musicBus(): GainNode | null {
  return graph()?.music ?? null;
}

function blip(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain = 0.2,
  slideTo?: number,
): void {
  const g2 = graph();
  if (!g2) return;
  const { ctx: c, master: m } = g2;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(m);
  o.start();
  o.stop(c.currentTime + dur + 0.02);
}

export const sfx = {
  hit: () => blip(180, 0.12, "triangle", 0.18, 90),
  ko: () => {
    blip(320, 0.28, "sawtooth", 0.22, 60);
    blip(140, 0.32, "square", 0.12, 50);
  },
  capture: () => {
    blip(520, 0.1, "sine", 0.16);
    setTimeout(() => blip(780, 0.14, "sine", 0.16), 90);
  },
  ability: () => blip(660, 0.16, "sine", 0.14, 990),
  boom: () => {
    blip(220, 0.3, "sawtooth", 0.2, 48);
    blip(90, 0.34, "square", 0.16, 40);
  },
  select: () => blip(440, 0.05, "sine", 0.1),
  lock: () => blip(300, 0.07, "square", 0.12),
  win: () => {
    [523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => blip(f, 0.18, "sine", 0.18), i * 110),
    );
  },
  lose: () => {
    [392, 330, 262].forEach((f, i) =>
      setTimeout(() => blip(f, 0.24, "sawtooth", 0.14), i * 140),
    );
  },
  /** clic générique de navigation (menus, écrans) — volontairement discret. */
  click: () => blip(520, 0.045, "square", 0.07),
  /** perte de connexion en ligne. */
  warn: () => blip(200, 0.22, "sawtooth", 0.14, 140),
  /** reconnexion réussie en ligne. */
  reconnect: () => {
    blip(440, 0.08, "sine", 0.12);
    setTimeout(() => blip(660, 0.1, "sine", 0.12), 80);
  },
};

export function toggleMute(): boolean {
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ac()?.currentTime ?? 0, 0.01);
  return muted;
}
export function isMuted(): boolean {
  return muted;
}
