import { db } from './database.js';
import { config } from '../config.js';
import { parseBattleTime } from '../utils/format.js';

const now = () => Date.now();

/* ------------------------------------------------------------------ liens */

const stmtGetLink = db.prepare('SELECT tag FROM links WHERE discord_id = ?');
const stmtSetLink = db.prepare(
  `INSERT INTO links (discord_id, tag, created_at) VALUES (?, ?, ?)
   ON CONFLICT (discord_id) DO UPDATE SET tag = excluded.tag`,
);
const stmtDeleteLink = db.prepare('DELETE FROM links WHERE discord_id = ?');

export const links = {
  get: (discordId) => stmtGetLink.get(discordId)?.tag ?? null,
  set: (discordId, tag) => stmtSetLink.run(discordId, tag, now()),
  remove: (discordId) => stmtDeleteLink.run(discordId).changes > 0,
};

/* ------------------------------------------------------------------ suivi */

const stmtTrack = db.prepare(
  `INSERT INTO tracked (tag, added_by, guild_id, created_at) VALUES (?, ?, ?, ?)
   ON CONFLICT (tag) DO NOTHING`,
);
const stmtUntrack = db.prepare('DELETE FROM tracked WHERE tag = ?');
const stmtListTracked = db.prepare(
  `SELECT t.tag, t.added_by, t.created_at, p.name
   FROM tracked t LEFT JOIN players p ON p.tag = t.tag
   ORDER BY t.created_at`,
);
const stmtIsTracked = db.prepare('SELECT 1 FROM tracked WHERE tag = ?');

export const tracking = {
  add: (tag, addedBy, guildId) => stmtTrack.run(tag, addedBy, guildId, now()).changes > 0,
  remove: (tag) => stmtUntrack.run(tag).changes > 0,
  list: () => stmtListTracked.all(),
  has: (tag) => Boolean(stmtIsTracked.get(tag)),
  count: () => stmtListTracked.all().length,
};

/* -------------------------------------------------------------- snapshots */

const stmtUpsertPlayer = db.prepare(
  `INSERT INTO players (tag, name, first_seen, last_seen) VALUES (?, ?, ?, ?)
   ON CONFLICT (tag) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen`,
);

const stmtInsertSnapshot = db.prepare(`
  INSERT INTO snapshots (
    tag, taken_at, name, trophies, highest_trophies, exp_level, exp_points,
    wins_3v3, wins_solo, wins_duo, brawlers_owned, brawlers_maxed,
    power_total, rank_total, club_tag, club_name
  ) VALUES (
    @tag, @taken_at, @name, @trophies, @highest_trophies, @exp_level, @exp_points,
    @wins_3v3, @wins_solo, @wins_duo, @brawlers_owned, @brawlers_maxed,
    @power_total, @rank_total, @club_tag, @club_name
  )
`);

const stmtInsertBrawlerSnapshot = db.prepare(`
  INSERT INTO brawler_snapshots (snapshot_id, brawler_id, name, trophies, highest_trophies, power, rank)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (snapshot_id, brawler_id) DO NOTHING
`);

const stmtLastSnapshot = db.prepare(
  'SELECT * FROM snapshots WHERE tag = ? ORDER BY taken_at DESC LIMIT 1',
);

/** Convertit un profil API en ligne de snapshot. */
export function toSnapshotRow(player, takenAt = now()) {
  const brawlers = player.brawlers ?? [];
  return {
    tag: player.tag,
    taken_at: takenAt,
    name: player.name ?? null,
    trophies: player.trophies ?? 0,
    highest_trophies: player.highestTrophies ?? 0,
    exp_level: player.expLevel ?? 0,
    exp_points: player.expPoints ?? 0,
    wins_3v3: player['3vs3Victories'] ?? 0,
    wins_solo: player.soloVictories ?? 0,
    wins_duo: player.duoVictories ?? 0,
    brawlers_owned: brawlers.length,
    brawlers_maxed: brawlers.filter((b) => b.power >= 11).length,
    power_total: brawlers.reduce((sum, b) => sum + (b.power ?? 0), 0),
    rank_total: brawlers.reduce((sum, b) => sum + (b.rank ?? 0), 0),
    club_tag: player.club?.tag ?? null,
    club_name: player.club?.name ?? null,
  };
}

/**
 * Enregistre un snapshot. Si le precedent est identique et recent (< 10 min),
 * on ne duplique pas la ligne : ca garde les graphiques lisibles.
 */
export const saveSnapshot = db.transaction((player, takenAt = now()) => {
  const row = toSnapshotRow(player, takenAt);
  stmtUpsertPlayer.run(row.tag, row.name, takenAt, takenAt);

  const previous = stmtLastSnapshot.get(row.tag);
  const unchanged =
    previous &&
    previous.trophies === row.trophies &&
    previous.wins_3v3 === row.wins_3v3 &&
    previous.wins_solo === row.wins_solo &&
    previous.wins_duo === row.wins_duo &&
    previous.exp_points === row.exp_points &&
    takenAt - previous.taken_at < 10 * 60 * 1000;
  if (unchanged) return previous.id;

  const { lastInsertRowid } = stmtInsertSnapshot.run(row);
  for (const brawler of player.brawlers ?? []) {
    stmtInsertBrawlerSnapshot.run(
      lastInsertRowid,
      brawler.id,
      brawler.name,
      brawler.trophies ?? 0,
      brawler.highestTrophies ?? 0,
      brawler.power ?? 0,
      brawler.rank ?? 0,
    );
  }
  return lastInsertRowid;
});

const stmtSnapshotBefore = db.prepare(
  'SELECT * FROM snapshots WHERE tag = ? AND taken_at <= ? ORDER BY taken_at DESC LIMIT 1',
);
const stmtFirstSnapshot = db.prepare(
  'SELECT * FROM snapshots WHERE tag = ? ORDER BY taken_at ASC LIMIT 1',
);
const stmtSeries = db.prepare(
  'SELECT * FROM snapshots WHERE tag = ? AND taken_at >= ? ORDER BY taken_at ASC',
);
const stmtCount = db.prepare('SELECT COUNT(*) AS n FROM snapshots WHERE tag = ?');

export const snapshots = {
  latest: (tag) => stmtLastSnapshot.get(tag) ?? null,
  /** Snapshot le plus proche AVANT un instant donne (base de comparaison). */
  before: (tag, timestamp) => stmtSnapshotBefore.get(tag, timestamp) ?? null,
  first: (tag) => stmtFirstSnapshot.get(tag) ?? null,
  since: (tag, timestamp) => stmtSeries.all(tag, timestamp),
  count: (tag) => stmtCount.get(tag).n,
};

const stmtBrawlersOfSnapshot = db.prepare(
  'SELECT * FROM brawler_snapshots WHERE snapshot_id = ?',
);
export const brawlerSnapshots = {
  bySnapshot: (snapshotId) => stmtBrawlersOfSnapshot.all(snapshotId),
  mapBySnapshot(snapshotId) {
    const map = new Map();
    for (const row of stmtBrawlersOfSnapshot.all(snapshotId)) map.set(row.brawler_id, row);
    return map;
  },
};

/* --------------------------------------------------------------- combats */

const stmtInsertBattle = db.prepare(`
  INSERT INTO battles (tag, battle_time, mode, map, type, result, trophy_change, brawler_name, is_star)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (tag, battle_time, brawler_name) DO NOTHING
`);

/** Archive le battlelog : l'API ne garde que 25 combats, la base garde tout. */
export const saveBattles = db.transaction((tag, battleLogItems) => {
  let inserted = 0;
  for (const item of battleLogItems ?? []) {
    const time = parseBattleTime(item.battleTime)?.getTime();
    if (!time) continue;
    const battle = item.battle ?? {};
    const me = findSelf(battle, tag);
    const changes = stmtInsertBattle.run(
      tag,
      time,
      battle.mode ?? item.event?.mode ?? null,
      item.event?.map ?? null,
      battle.type ?? null,
      battle.result ?? (battle.rank != null ? `rank${battle.rank}` : null),
      battle.trophyChange ?? 0,
      me?.brawler?.name ?? null,
      battle.starPlayer?.tag === tag ? 1 : 0,
    ).changes;
    inserted += changes;
  }
  return inserted;
});

function findSelf(battle, tag) {
  const pools = [];
  if (Array.isArray(battle.teams)) pools.push(...battle.teams.flat());
  if (Array.isArray(battle.players)) pools.push(...battle.players);
  return pools.find((p) => p?.tag === tag) ?? null;
}

const stmtBattlesSince = db.prepare(
  'SELECT * FROM battles WHERE tag = ? AND battle_time >= ? ORDER BY battle_time DESC',
);
export const battles = {
  since: (tag, timestamp) => stmtBattlesSince.all(tag, timestamp),
};

/* ------------------------------------------------------------- entretien */

const stmtPurgeSnapshots = db.prepare('DELETE FROM snapshots WHERE taken_at < ?');
const stmtPurgeBattles = db.prepare('DELETE FROM battles WHERE battle_time < ?');

export function purgeOldData() {
  const cutoff = now() - config.snapshots.retentionDays * 86_400_000;
  const removed = stmtPurgeSnapshots.run(cutoff).changes + stmtPurgeBattles.run(cutoff).changes;
  return removed;
}
