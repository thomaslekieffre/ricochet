import "./styles.css";
import { App } from "./game/app";
import { isMuted, toggleMute } from "./game/audio";

const canvas = document.getElementById("stage");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#stage introuvable");

new App(canvas);

const mute = document.getElementById("btnMute");
mute?.addEventListener("click", () => {
  const m = toggleMute();
  mute.textContent = m ? "🔇" : "🔊";
});
if (mute) mute.textContent = isMuted() ? "🔇" : "🔊";
