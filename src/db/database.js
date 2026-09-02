import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

fs.mkdirSync(path.dirname(config.db.file), { recursive: true });

export const db = new Database(config.db.file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    tag         TEXT PRIMARY KEY,
    name        TEXT,
    first_seen  INTEGER NOT NULL,
    last_seen   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS links (
    discord_id  TEXT PRIMARY KEY,
    tag         TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tracked (
    tag         TEXT PRIMARY KEY,
    added_by    TEXT,
    guild_id    TEXT,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS snapshots (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    tag               TEXT NOT NULL,
    taken_at          INTEGER NOT NULL,
    name              TEXT,
    trophies          INTEGER,
    highest_trophies  INTEGER,
    exp_level         INTEGER,
    exp_points        INTEGER,
    wins_3v3          INTEGER,
    wins_solo         INTEGER,
    wins_duo          INTEGER,
    brawlers_owned    INTEGER,
    brawlers_maxed    INTEGER,
    power_total       INTEGER,
    rank_total        INTEGER,
    club_tag          TEXT,
    club_name         TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_tag_time ON snapshots (tag, taken_at);

  CREATE TABLE IF NOT EXISTS brawler_snapshots (
    snapshot_id       INTEGER NOT NULL REFERENCES snapshots (id) ON DELETE CASCADE,
    brawler_id        INTEGER NOT NULL,
    name              TEXT,
    trophies          INTEGER,
    highest_trophies  INTEGER,
    power             INTEGER,
    rank              INTEGER,
    PRIMARY KEY (snapshot_id, brawler_id)
  );

  CREATE TABLE IF NOT EXISTS battles (
    tag           TEXT NOT NULL,
    battle_time   INTEGER NOT NULL,
    mode          TEXT,
    map           TEXT,
    type          TEXT,
    result        TEXT,
    trophy_change INTEGER,
    brawler_name  TEXT,
    is_star       INTEGER,
    PRIMARY KEY (tag, battle_time, brawler_name)
  );

  CREATE INDEX IF NOT EXISTS idx_battles_tag_time ON battles (tag, battle_time);
`);

export function closeDatabase() {
  try {
    db.close();
  } catch {
    /* deja ferme */
  }
}
