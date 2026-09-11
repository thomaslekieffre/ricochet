import { fromFloat, fromInt, ONE } from "./fixed";
import type { Archetype, Body, HeroKind, V } from "./types";

export interface HeroDef {
  kind: HeroKind;
  name: string;
  archetype: Archetype;
  mass: number; // fixed
  radius: number; // fixed
  launchBase: number; // fixed — units/sec at power 0
  launchPower: number; // fixed — extra units/sec at power 1
  /** multiplier on impulses this body delivers in a collision (ONE == 1x) */
  kbDealt: number; // fixed
  /** fraction of incoming knockback this body keeps (ONE == normal, <ONE == sturdy) */
  kbTaken: number; // fixed
  abilityCost: number; // Momentum
  ranged: boolean; // its "attack" is a projectile, not a body-slam
  blurb: string; // une phrase, pour les listes compactes
  /** Fiche lisible — mêmes mots dans le codex et dans la barre d'action en match. */
  base: string;
  ability: { name: string; effect: string };
  passive: { name: string; effect: string };
}

export const HEROES: Record<HeroKind, HeroDef> = {
  boulder: {
    kind: "boulder",
    name: "Boulder",
    archetype: "brawler",
    mass: fromFloat(1.85),
    radius: fromInt(50),
    launchBase: fromFloat(360),
    launchPower: fromFloat(520),
    kbDealt: fromFloat(1.3),
    kbTaken: fromFloat(0.8),
    abilityCost: 3,
    ranged: false,
    blurb: "Frappe comme un éboulement. Quake : onde radiale.",
    base: "Charge lourde en ligne droite. Peu de vitesse, gros impact.",
    ability: {
      name: "Quake",
      effect: "Onde de choc : repousse tout le monde autour de Boulder à l'impact.",
    },
    passive: { name: "Roc", effect: "Encaisse 30 % de knockback en moins." },
  },
  ram: {
    kind: "ram",
    name: "Ram",
    archetype: "brawler",
    mass: fromFloat(1.4),
    radius: fromInt(44),
    launchBase: fromFloat(470),
    launchPower: fromFloat(900),
    kbDealt: ONE,
    kbTaken: ONE,
    abilityCost: 2,
    ranged: false,
    blurb: "Knockback qui monte avec l'élan. Second Souffle : relance.",
    base: "Charge rapide en ligne droite.",
    ability: {
      name: "Second Souffle",
      effect: "Après la charge, Ram repart aussitôt dans la même direction.",
    },
    passive: {
      name: "Élan",
      effect: "Plus la charge est longue avant le choc, plus ça pousse.",
    },
  },
  comet: {
    kind: "comet",
    name: "Comet",
    archetype: "dasher",
    mass: fromFloat(0.7),
    radius: fromInt(38),
    launchBase: fromFloat(780),
    launchPower: fromFloat(1180), // dasher : porte nettement plus loin à pleine puissance
    kbDealt: fromFloat(0.9),
    kbTaken: fromFloat(1.15),
    abilityCost: 2,
    ranged: false,
    blurb: "Traverse tout le monde. Slipstream : intouchable ce tour.",
    base: "Dash très rapide qui traverse les corps et les bouscule au passage.",
    ability: {
      name: "Slipstream",
      effect: "Intouchable ce tour : Comet ignore toutes les collisions.",
    },
    passive: { name: "Sillage", effect: "+1 Momentum par héros traversé." },
  },
  hook: {
    kind: "hook",
    name: "Hook",
    archetype: "dasher",
    mass: fromFloat(0.95),
    radius: fromInt(40),
    launchBase: fromFloat(620),
    launchPower: fromFloat(920), // dasher : porte plus loin à pleine puissance
    kbDealt: ONE,
    kbTaken: fromFloat(0.85),
    abilityCost: 2,
    ranged: false,
    blurb: "Tire la cible au lieu de la pousser. Grappin : prise à distance.",
    base: "Dash ; au contact d'un ennemi, le tire vers soi et s'arrête net.",
    ability: {
      name: "Grappin",
      effect: "Prise à distance : agrippe le premier ennemi sur la ligne de visée et le ramène.",
    },
    passive: {
      name: "Accroche",
      effect: "N'importe quelle charge de Hook agrippe l'ennemi touché.",
    },
  },
  sling: {
    kind: "sling",
    name: "Sling",
    archetype: "sniper",
    mass: fromFloat(0.7),
    radius: fromInt(38),
    launchBase: fromFloat(150),
    launchPower: fromFloat(240),
    kbDealt: fromFloat(0.85),
    kbTaken: fromFloat(1.1),
    abilityCost: 3,
    ranged: true,
    blurb: "Projectile en ligne. Ricochet : rebond mural. +kb s'il n'a pas bougé.",
    base: "Tir : un projectile file en ligne droite. Sling bouge à peine.",
    ability: {
      name: "Ricochet",
      effect: "Le projectile rebondit une fois sur un mur avant de frapper.",
    },
    passive: {
      name: "Affût",
      effect: "+50 % d'impact au tir si Sling n'a pas bougé au tour d'avant.",
    },
  },
  prism: {
    kind: "prism",
    name: "Prism",
    archetype: "mage",
    mass: fromFloat(1.3),
    radius: fromInt(44),
    launchBase: fromFloat(420),
    launchPower: fromFloat(560),
    kbDealt: fromFloat(0.8),
    kbTaken: ONE,
    abilityCost: 2,
    ranged: false,
    blurb: "Éclat à retardement. Mur : barrière temporaire.",
    base: "Charge, et pose un Éclat : une bombe qui explose au tour suivant.",
    ability: {
      name: "Mur",
      effect: "À la place de l'Éclat, dresse une barrière temporaire en travers de la visée.",
    },
    passive: {
      name: "Rémanence",
      effect: "L'Éclat explose seul au tour suivant, même si Prism s'est fait sortir.",
    },
  },
  vex: {
    kind: "vex",
    name: "Vex",
    archetype: "mage",
    mass: fromFloat(1.2),
    radius: fromInt(42),
    launchBase: fromFloat(400),
    launchPower: fromFloat(540),
    kbDealt: fromFloat(0.75),
    kbTaken: ONE,
    abilityCost: 3,
    ranged: false,
    blurb: "Charge, puis tire les ennemis vers elle. Effondrement : la traction s'intensifie à l'arrêt.",
    base: "Charge courte.",
    ability: {
      name: "Effondrement",
      effect: "Ouvre une faille sous ses pieds : tire tous les ennemis proches vers Vex au lieu de les repousser.",
    },
    passive: {
      name: "Ancrage",
      effect: "+40 % de traction si Vex n'a pas agi au tour précédent.",
    },
  },
  arc: {
    kind: "arc",
    name: "Arc",
    archetype: "sniper",
    mass: fromFloat(0.75),
    radius: fromInt(38),
    launchBase: fromFloat(140),
    launchPower: fromFloat(220),
    kbDealt: fromFloat(0.85),
    kbTaken: fromFloat(1.1),
    abilityCost: 3,
    ranged: true,
    blurb: "Projectile à éclats : touche aussi les ennemis proches de l'impact. Fragmentation : éclats bien plus larges.",
    base: "Tir : un projectile lent qui éclabousse à l'impact. Arc bouge à peine.",
    ability: {
      name: "Fragmentation",
      effect: "Le prochain tir éclabousse un rayon bien plus large.",
    },
    passive: {
      name: "Éclaboussure",
      effect: "Chaque tir touche aussi les ennemis proches du point d'impact, avec moins de force.",
    },
  },
};

export const ROSTER: HeroKind[] = [
  "boulder",
  "ram",
  "comet",
  "hook",
  "sling",
  "prism",
  "vex",
  "arc",
];

export function makeBody(id: number, owner: 0 | 1, hero: HeroKind, at: V): Body {
  const def = HEROES[hero];
  return {
    id,
    owner,
    hero,
    x: at.x,
    y: at.y,
    vx: 0,
    vy: 0,
    radius: def.radius,
    mass: def.mass,
    alive: true,
    respawnIn: 0,
    acting: false,
    charging: false,
    chargeDist: 0,
    intangible: false,
    passedThisTurn: [],
    actedLastTurn: false,
    aimIdx: 0,
  };
}
