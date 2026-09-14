/**
 * Musique de fond — vrais morceaux (Kevin MacLeod / incompetech.com, licence
 * CC BY 3.0, cf. `src/assets/music/CREDITS.txt` et l'écran « Crédits » du
 * menu) plutôt que de la synthèse : un premier essai 100% WebAudio
 * (oscillateurs, puis flûte/corde pincée synthétisées) restait trop
 * "robotique" au retour de Zoe. Chaque piste est chargée en `AudioBuffer`
 * (paresseusement, une seule fois) et jouée en boucle via `AudioBufferSourceNode`
 * sur le bus musique partagé de `audio.ts` (mute + volume communs avec les SFX).
 */

import menuUrl from "../assets/music/menu-wallpaper.mp3";
import carrefourUrl from "../assets/music/carrefour-local-forecast.mp3";
import fonderieUrl from "../assets/music/fonderie-industrial-cinematic.mp3";
import flipperUrl from "../assets/music/flipper-cheery-monday.mp3";
import { audioContext, musicBus } from "./audio";

const TRACK_URL: Record<string, string> = {
  menu: menuUrl,
  carrefour: carrefourUrl,
  fonderie: fonderieUrl,
  flipper: flipperUrl,
};

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer>>();

function loadBuffer(ctx: AudioContext, name: string, url: string): Promise<AudioBuffer> {
  const cached = buffers.get(name);
  if (cached) return Promise.resolve(cached);
  const pending = loading.get(name);
  if (pending) return pending;
  const p = fetch(url)
    .then((r) => r.arrayBuffer())
    .then((data) => ctx.decodeAudioData(data))
    .then((buf) => {
      buffers.set(name, buf);
      loading.delete(name);
      return buf;
    });
  loading.set(name, p);
  return p;
}

let source: AudioBufferSourceNode | null = null;
let current: string | null = null;
/** Incrémenté à chaque changement de piste : une réponse `fetch`/`decode` en
 *  vol pour une piste abandonnée ne doit pas démarrer une fois arrivée. */
let requestId = 0;

/** Démarre (ou change) la boucle de musique de fond. Idempotent si déjà sur ce morceau. */
export function playMusic(name: string): void {
  const url = TRACK_URL[name] ?? TRACK_URL.carrefour!;
  const key = TRACK_URL[name] ? name : "carrefour";
  if (current === key) return;
  current = key;
  const myRequest = ++requestId;
  stopMusic(false);

  const ctx = audioContext();
  const bus = musicBus();
  if (!ctx || !bus) return;
  void loadBuffer(ctx, key, url).then((buf) => {
    if (myRequest !== requestId) return; // une autre piste a été demandée entre-temps
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(bus);
    src.start();
    source = src;
  });
}

export function stopMusic(forget = true): void {
  if (source) {
    try {
      source.stop();
    } catch {
      // déjà arrêté — sans conséquence
    }
    source.disconnect();
    source = null;
  }
  if (forget) current = null;
}
