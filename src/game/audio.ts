/** Tiny synthesized SFX — no asset files. Created lazily on first user gesture. */

let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function blip(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain = 0.2,
  slideTo?: number,
): void {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, c.currentTime);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
  g.gain.setValueAtTime(gain, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
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
};

export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}
export function isMuted(): boolean {
  return muted;
}
