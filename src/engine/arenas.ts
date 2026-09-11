import { fromFloat, fromInt } from "./fixed";
import { WALL_RESTITUTION } from "./tuning";
import type { Arena } from "./types";

const W = fromInt(1600);
const H = fromInt(1000);
const ZONE = { x: fromInt(800), y: fromInt(500), r: fromInt(180) };

const spawns = (): Arena["spawn"] => [
  [
    { x: fromInt(300), y: fromInt(300) },
    { x: fromInt(240), y: fromInt(500) },
    { x: fromInt(300), y: fromInt(700) },
  ],
  [
    { x: fromInt(1300), y: fromInt(300) },
    { x: fromInt(1360), y: fromInt(500) },
    { x: fromInt(1300), y: fromInt(700) },
  ],
];

/** Carrefour — clean rectangle, no hazards. The competitive default. */
export const CARREFOUR: Arena = {
  id: "carrefour",
  name: "Carrefour",
  w: W,
  h: H,
  zone: ZONE,
  spawn: spawns(),
  walls: [],
  conveyors: [],
  bumpers: [],
};

/** Fonderie — two conveyor strips along the long edges pushing bodies outward to the KO line. */
export const FONDERIE: Arena = {
  id: "fonderie",
  name: "Fonderie",
  w: W,
  h: H,
  zone: ZONE,
  spawn: spawns(),
  walls: [],
  conveyors: [
    { x: 0, y: 0, w: W, h: fromInt(120), ax: 0, ay: fromFloat(-520) },
    { x: 0, y: fromInt(880), w: W, h: fromInt(120), ax: 0, ay: fromFloat(520) },
  ],
  bumpers: [],
};

/** Flipper — four elastic bumpers around the zone; trajectories go pinball. */
export const FLIPPER: Arena = {
  id: "flipper",
  name: "Flipper",
  w: W,
  h: H,
  zone: ZONE,
  spawn: spawns(),
  walls: [],
  conveyors: [],
  bumpers: [
    { x: fromInt(800), y: fromInt(250), radius: fromInt(46), gain: fromFloat(1.5) },
    { x: fromInt(800), y: fromInt(750), radius: fromInt(46), gain: fromFloat(1.5) },
    { x: fromInt(560), y: fromInt(500), radius: fromInt(46), gain: fromFloat(1.5) },
    { x: fromInt(1040), y: fromInt(500), radius: fromInt(46), gain: fromFloat(1.5) },
  ],
};

export const ARENAS: Arena[] = [CARREFOUR, FONDERIE, FLIPPER];
export const arenaById = (id: string): Arena =>
  ARENAS.find((a) => a.id === id) ?? CARREFOUR;

// keep the import referenced even if walls are empty for now
void WALL_RESTITUTION;
