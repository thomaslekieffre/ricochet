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

function note(
  ctx: AudioContext,
  bus: GainNode,
  t: number,
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.02);
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
  if (b != null) note(ctx, bus, time, (t.root / 2) * 2 ** (b / 12), stepDur * 3.4, "triangle", 0.22);
  const l = t.lead[i];
  if (l != null) note(ctx, bus, time, t.root * 2 ** (l / 12), stepDur * 0.85, "square", 0.11);
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
