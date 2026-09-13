import "./styles.css";
import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { App } from "./game/App";
import { isMuted, toggleMute } from "./game/audio";

const canvas = document.getElementById("stage");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("#stage introuvable");

const overlay = document.getElementById("overlay");
if (!overlay) throw new Error("#overlay introuvable");
createRoot(overlay).render(createElement(App, { canvas }));

const mute = document.getElementById("btnMute");
mute?.addEventListener("click", () => {
  const m = toggleMute();
  mute.textContent = m ? "🔇" : "🔊";
});
if (mute) mute.textContent = isMuted() ? "🔇" : "🔊";
