/**
 * Musique de fond synthétisée — mêmes contraintes que `audio.ts` : zéro
 * fichier son, zéro dépendance runtime. Un séquenceur pas-à-pas planifie les
 * notes à l'avance sur l'horloge audio (« lookahead scheduler », immunisé au
 * throttling de `setInterval`/rAF quand l'onglet perd le focus — seul le
 * calcul du *prochain* pas peut prendre du retard, jamais la lecture des
 * notes déjà programmées).
 */

import { audioContext, musicBus } from "./audio";

type Step = number | null; // demi-tons depuis la fondamentale, null = silence
type PercType = "hat" | "clang";

interface Track {
  bpm: number;
  root: number; // Hz, fondamentale du lead (la basse joue un octave plus bas)
  lead: Step[];
  bass: Step[];
  kick: boolean[];
  perc: boolean[];
  percType: PercType;
}

const TRACKS: Record<string, Track> = {
  // Menu — pep arcade, pentatonique majeure, boucle qui respire.
  menu: {
    bpm: 132,
    root: 261.63, // C4
    lead: [0, null, 7, null, 9, 7, null, 4, 0, null, 7, 9, 12, 9, 7, 4],
    bass: [0, null, null, null, 0, null, null, null, 7, null, null, null, 5, null, 7, null],
    kick: [
      true, false, false, true, false, false, true, false,
      true, false, false, true, false, false, true, false,
    ],
    perc: [
      false, true, false, true, false, true, false, true,
      false, true, false, true, false, true, false, true,
    ],
    percType: "hat",
  },
  // Carrefour — le terrain propre, sans piège : quatre-à-la-mesure carré.
  carrefour: {
    bpm: 120,
    root: 220, // A3
    lead: [0, 3, 5, null, 7, 5, 3, null, 0, 3, 5, 7, 10, 7, 5, 3],
    bass: [0, null, null, null, 0, null, null, null, 0, null, null, null, 3, null, null, null],
    kick: [
      true, false, false, false, true, false, false, false,
      true, false, false, false, true, false, false, false,
    ],
    perc: [
      false, false, true, false, false, false, true, false,
      false, false, true, false, false, false, true, false,
    ],
    percType: "hat",
  },
  // Fonderie — convoyeurs, métal lourd : basse grave, clang au lieu du hat.
  fonderie: {
    bpm: 100,
    root: 164.81, // E3
    lead: [null, null, 3, null, null, 5, null, null, 0, null, null, null, 3, 5, 3, null],
    bass: [0, null, null, null, null, null, 0, null, null, null, -2, null, null, null, null, null],
    kick: [
      true, false, false, true, false, false, true, false,
      true, false, false, false, false, true, false, false,
    ],
    perc: [
      false, false, true, false, false, false, false, true,
      false, false, true, false, false, false, true, false,
    ],
    percType: "clang",
  },
  // Flipper — bumpers élastiques : rebonds d'octave, arpèges majeurs rapides.
  flipper: {
    bpm: 152,
    root: 293.66, // D4
    lead: [0, 4, 7, 12, 7, 4, 0, 4, 7, 11, 12, 11, 7, 4, 0, null],
    bass: [0, null, 12, null, 0, null, 12, null, 7, null, 19, null, 7, null, 12, null],
    kick: [
      true, false, true, false, false, true, false, true,
      true, false, true, false, false, true, false, false,
    ],
    perc: [
      false, true, false, true, false, true, false, true,
      false, true, false, true, false, true, false, true,
    ],
    percType: "hat",
  },
};

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.12;

let noiseBuf: AudioBuffer | null = null;
function noise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    const len = Math.floor(ctx.sampleRate * 0.3);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/**
 * Flûte — sinusoïde (le souffle d'une flûte est presque un ton pur) + léger
 * vibrato + une fine couche de bruit filtré en bande (le souffle) sous le
 * ton, avec une attaque douce plutôt qu'un déclic net. Pour le lead.
 */
function flute(ctx: AudioContext, bus: GainNode, t: number, freq: number, dur: number, gain: number): void {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(freq, t);

  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 5;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.value = freq * 0.008;
  vibrato.connect(vibratoDepth).connect(o.frequency);
  vibrato.start(t);
  vibrato.stop(t + dur + 0.05);

  const attack = Math.min(0.05, dur * 0.35);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);

  const breath = ctx.createBufferSource();
  breath.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq * 1.5;
  bp.Q.value = 0.9;
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.linearRampToValueAtTime(gain * 0.22, t + attack);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  breath.connect(bp).connect(bg).connect(bus);
  breath.start(t);
  breath.stop(t + dur + 0.05);
}

/**
 * Corde pincée façon guitare/harpe — modèle Karplus-Strong : une brève
 * impulsion de bruit excite une boucle à retard (delay + filtre passe-bas
 * dans le retour), qui simule une corde qui vibre et s'éteint naturellement.
 * Beaucoup plus « organique » qu'un oscillateur classique. Pour la basse.
 */
function pluck(ctx: AudioContext, bus: GainNode, t: number, freq: number, ring: number, gain: number): void {
  const delayTime = 1 / freq;
  const delay = ctx.createDelay(0.05);
  delay.delayTime.value = delayTime;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = Math.min(freq * 9, 4200);
  const feedback = ctx.createGain();
  feedback.gain.value = 0.98;

  const excite = ctx.createBufferSource();
  excite.buffer = noise(ctx);
  const exciteGain = ctx.createGain();
  exciteGain.gain.setValueAtTime(gain * 1.6, t);
  exciteGain.gain.exponentialRampToValueAtTime(0.0001, t + delayTime * 1.5);

  const out = ctx.createGain();
  out.gain.setValueAtTime(gain * 1.3, t);
  out.gain.exponentialRampToValueAtTime(0.0001, t + ring);

  excite.connect(exciteGain).connect(delay);
  delay.connect(damp);
  damp.connect(feedback);
  feedback.connect(delay); // boucle de retard — simule la corde qui vibre
  damp.connect(out).connect(bus);

  excite.start(t);
  excite.stop(t + delayTime * 2);

  const cleanupMs = Math.max(0, (t - ctx.currentTime + ring + 0.1) * 1000);
  setTimeout(() => {
    delay.disconnect();
    damp.disconnect();
    feedback.disconnect();
    out.disconnect();
  }, cleanupMs);
}

function kick(ctx: AudioContext, bus: GainNode, t: number): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.13);
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + 0.18);
}

function hat(ctx: AudioContext, bus: GainNode, t: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.1, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(hp).connect(g).connect(bus);
  src.start(t);
  src.stop(t + 0.06);
}

/** Percussion métallique (Fonderie) — bruit filtré en cloche, plus long que le hat. */
function clang(ctx: AudioContext, bus: GainNode, t: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 800 + Math.random() * 500;
  bp.Q.value = 7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.14, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  src.connect(bp).connect(g).connect(bus);
  src.start(t);
  src.stop(t + 0.24);
}

let timer: number | null = null;
let current: string | null = null;
let track: Track | null = null;
let step = 0;
let nextNoteTime = 0;

function scheduleStep(ctx: AudioContext, bus: GainNode, t: Track, i: number, time: number): void {
  const stepDur = 60 / t.bpm / 4;
  if (t.kick[i]) kick(ctx, bus, time);
  if (t.perc[i]) (t.percType === "clang" ? clang : hat)(ctx, bus, time);
  const b = t.bass[i];
  // la corde pincée sonne toute seule (Karplus-Strong) : on la laisse vibrer
  // ~2 temps plutôt que de la couper à la durée du pas, comme une vraie
  // pince de guitare/harpe qu'on ne rejoue qu'au prochain temps.
  if (b != null) pluck(ctx, bus, time, (t.root / 2) * 2 ** (b / 12), (60 / t.bpm) * 2, 0.5);
  const l = t.lead[i];
  if (l != null) flute(ctx, bus, time, t.root * 2 ** (l / 12), stepDur * 0.95, 0.16);
}

function tick(): void {
  const ctx = audioContext();
  const bus = musicBus();
  if (!ctx || !bus || !track) return;
  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
    scheduleStep(ctx, bus, track, step, nextNoteTime);
    nextNoteTime += 60 / track.bpm / 4;
    step = (step + 1) % track.lead.length;
  }
}

/** Démarre (ou change) la boucle de musique de fond. Idempotent si déjà sur ce morceau. */
export function playMusic(name: string): void {
  const t = TRACKS[name] ?? TRACKS.carrefour!;
  if (current === name) return;
  stopMusic();
  current = name;
  track = t;
  step = 0;
  const ctx = audioContext();
  nextNoteTime = (ctx?.currentTime ?? 0) + 0.05;
  timer = window.setInterval(tick, LOOKAHEAD_MS);
}

export function stopMusic(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  current = null;
  track = null;
}
