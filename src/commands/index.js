import * as profil from './profil.js';
import * as stats from './stats.js';
import * as graph from './graph.js';
import * as brawlers from './brawlers.js';
import * as combats from './combats.js';
import * as comparer from './comparer.js';
import * as club from './club.js';
import * as lier from './lier.js';
import * as suivi from './suivi.js';
import * as aide from './aide.js';

export const commandModules = [
  profil,
  stats,
  graph,
  brawlers,
  combats,
  comparer,
  club,
  lier,
  suivi,
  aide,
];

/** Map nom -> module, utilisee par le routeur d'interactions. */
export const commands = new Map(commandModules.map((mod) => [mod.data.name, mod]));

export const commandsJson = commandModules.map((mod) => mod.data.toJSON());
