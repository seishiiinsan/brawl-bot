import { brawlApi } from '../api/brawlstars.js';
import {
  snapshots,
  brawlerSnapshots,
  saveSnapshot,
  saveBattles,
  battles as battleRepo,
  toSnapshotRow,
} from '../db/repository.js';

export const PERIODS = {
  '24h': { label: 'dernières 24 h', ms: 24 * 3600_000 },
  '7j': { label: '7 derniers jours', ms: 7 * 24 * 3600_000 },
  '30j': { label: '30 derniers jours', ms: 30 * 24 * 3600_000 },
  all: { label: 'depuis le début du suivi', ms: null },
};

/**
 * Recupere le profil frais, l'archive, et renvoie le joueur + son snapshot courant.
 * Chaque commande passe par ici : le simple fait de consulter un profil alimente
 * l'historique, donc les graphiques se remplissent tout seuls.
 */
export async function fetchAndRecord(tag, { withBattles = false } = {}) {
  const player = await brawlApi.getPlayer(tag);
  const takenAt = Date.now();
  const snapshotId = saveSnapshot(player, takenAt);

  if (withBattles) {
    try {
      const log = await brawlApi.getBattleLog(tag);
      saveBattles(player.tag, log.items ?? []);
    } catch {
      /* le battlelog est optionnel : on n'echoue pas la commande pour ca */
    }
  }

  return { player, snapshotId, current: toSnapshotRow(player, takenAt) };
}

const METRICS = [
  ['trophies', 'trophies'],
  ['highestTrophies', 'highest_trophies'],
  ['expLevel', 'exp_level'],
  ['expPoints', 'exp_points'],
  ['wins3v3', 'wins_3v3'],
  ['winsSolo', 'wins_solo'],
  ['winsDuo', 'wins_duo'],
  ['brawlersOwned', 'brawlers_owned'],
  ['brawlersMaxed', 'brawlers_maxed'],
  ['powerTotal', 'power_total'],
  ['rankTotal', 'rank_total'],
];

/**
 * Compare l'etat actuel a la reference la plus proche du debut de periode.
 * `partial` signale qu'on n'a pas encore d'historique couvrant toute la periode.
 */
export function computeProgress(tag, current, periodKey) {
  const period = PERIODS[periodKey] ?? PERIODS['24h'];
  const cutoff = period.ms === null ? 0 : Date.now() - period.ms;

  let baseline = period.ms === null ? snapshots.first(tag) : snapshots.before(tag, cutoff);
  let partial = false;
  if (!baseline) {
    baseline = snapshots.first(tag);
    partial = true;
  }

  if (!baseline) {
    return { period, baseline: null, deltas: {}, partial: true, coveredMs: 0 };
  }

  const deltas = {};
  for (const [key, column] of METRICS) {
    deltas[key] = (current[column] ?? 0) - (baseline[column] ?? 0);
  }
  deltas.winsTotal = deltas.wins3v3 + deltas.winsSolo + deltas.winsDuo;

  return {
    period,
    baseline,
    deltas,
    partial,
    coveredMs: Date.now() - baseline.taken_at,
  };
}

/** Brawlers ayant le plus bouge sur la periode (gains et pertes). */
export function brawlerMovers(tag, currentSnapshotId, periodKey, limit = 5) {
  const period = PERIODS[periodKey] ?? PERIODS['24h'];
  const cutoff = period.ms === null ? 0 : Date.now() - period.ms;
  const baseline =
    (period.ms === null ? snapshots.first(tag) : snapshots.before(tag, cutoff)) ??
    snapshots.first(tag);
  if (!baseline || baseline.id === currentSnapshotId) return { gains: [], losses: [] };

  const before = brawlerSnapshots.mapBySnapshot(baseline.id);
  const after = brawlerSnapshots.bySnapshot(currentSnapshotId);

  const moved = after
    .map((row) => {
      const old = before.get(row.brawler_id);
      return {
        name: row.name,
        trophies: row.trophies,
        rank: row.rank,
        power: row.power,
        delta: row.trophies - (old?.trophies ?? row.trophies),
        isNew: !old,
      };
    })
    .filter((row) => row.delta !== 0 || row.isNew);

  return {
    gains: moved.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, limit),
    losses: moved.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, limit),
    newcomers: moved.filter((r) => r.isNew).map((r) => r.name),
  };
}

/** Serie temporelle prete a tracer. */
export function series(tag, periodKey, column = 'trophies') {
  const period = PERIODS[periodKey] ?? PERIODS['7j'];
  const cutoff = period.ms === null ? 0 : Date.now() - period.ms;
  const rows = snapshots.since(tag, cutoff);

  // On ancre la courbe sur le point juste avant la periode, sinon le graphique
  // demarre au premier releve interne et masque la progression du debut.
  const anchor = snapshots.before(tag, cutoff);
  const all = anchor && !rows.some((r) => r.id === anchor.id) ? [anchor, ...rows] : rows;

  return all
    .map((row) => ({ t: row.taken_at, v: row[column] }))
    .filter((point) => point.v !== null && point.v !== undefined);
}

/** Statistiques de combats sur une periode, a partir de l'archive locale. */
export function battleStats(tag, periodKey) {
  const period = PERIODS[periodKey] ?? PERIODS['24h'];
  const cutoff = period.ms === null ? 0 : Date.now() - period.ms;
  const rows = battleRepo.since(tag, cutoff);

  const stats = {
    total: rows.length,
    victories: 0,
    defeats: 0,
    draws: 0,
    trophyChange: 0,
    starPlayer: 0,
    byMode: new Map(),
    byBrawler: new Map(),
    ranked: [],
  };

  for (const row of rows) {
    stats.trophyChange += row.trophy_change ?? 0;
    if (row.is_star) stats.starPlayer += 1;

    const result = row.result ?? '';
    if (result === 'victory') stats.victories += 1;
    else if (result === 'defeat') stats.defeats += 1;
    else if (result === 'draw') stats.draws += 1;
    else if (result.startsWith('rank')) {
      const rank = Number(result.slice(4));
      stats.ranked.push(rank);
      // Showdown : top moitie = victoire (convention communaute).
      if (rank <= 4) stats.victories += 1;
      else stats.defeats += 1;
    }

    bump(stats.byMode, row.mode ?? 'inconnu', row);
    bump(stats.byBrawler, row.brawler_name ?? 'inconnu', row);
  }

  const decided = stats.victories + stats.defeats;
  stats.winrate = decided > 0 ? (stats.victories / decided) * 100 : null;
  stats.modes = [...stats.byMode.values()].sort((a, b) => b.total - a.total);
  stats.brawlers = [...stats.byBrawler.values()].sort((a, b) => b.total - a.total);
  return stats;
}

function bump(map, key, row) {
  let entry = map.get(key);
  if (!entry) {
    entry = { key, total: 0, victories: 0, defeats: 0, trophyChange: 0 };
    map.set(key, entry);
  }
  entry.total += 1;
  entry.trophyChange += row.trophy_change ?? 0;
  const result = row.result ?? '';
  if (result === 'victory' || (result.startsWith('rank') && Number(result.slice(4)) <= 4)) {
    entry.victories += 1;
  } else if (result === 'defeat' || result.startsWith('rank')) {
    entry.defeats += 1;
  }
  entry.winrate = entry.victories + entry.defeats > 0
    ? (entry.victories / (entry.victories + entry.defeats)) * 100
    : null;
}

/** Agregats "poussés" calcules directement depuis le profil. */
export function deepStats(player) {
  const brawlers = player.brawlers ?? [];
  const sorted = [...brawlers].sort((a, b) => b.trophies - a.trophies);
  const top = sorted.slice(0, 25);

  const totalTrophies = brawlers.reduce((s, b) => s + b.trophies, 0);
  const totalHighest = brawlers.reduce((s, b) => s + b.highestTrophies, 0);
  const ranks = brawlers.map((b) => b.rank ?? 0);

  return {
    owned: brawlers.length,
    maxed: brawlers.filter((b) => b.power >= 11).length,
    averagePower: brawlers.length ? brawlers.reduce((s, b) => s + b.power, 0) / brawlers.length : 0,
    averageTrophies: brawlers.length ? totalTrophies / brawlers.length : 0,
    averageRank: brawlers.length ? ranks.reduce((s, r) => s + r, 0) / brawlers.length : 0,
    highestRank: Math.max(0, ...ranks),
    rank35Plus: brawlers.filter((b) => (b.rank ?? 0) >= 35).length,
    rank30Plus: brawlers.filter((b) => (b.rank ?? 0) >= 30).length,
    rank25Plus: brawlers.filter((b) => (b.rank ?? 0) >= 25).length,
    /** Ecart entre les trophees actuels et les records : la "dette" de trophees. */
    trophyDebt: totalHighest - totalTrophies,
    top25Trophies: top.reduce((s, b) => s + b.trophies, 0),
    gadgets: brawlers.reduce((s, b) => s + (b.gadgets?.length ?? 0), 0),
    starPowers: brawlers.reduce((s, b) => s + (b.starPowers?.length ?? 0), 0),
    gears: brawlers.reduce((s, b) => s + (b.gears?.length ?? 0), 0),
    winsTotal:
      (player['3vs3Victories'] ?? 0) + (player.soloVictories ?? 0) + (player.duoVictories ?? 0),
    sorted,
  };
}
