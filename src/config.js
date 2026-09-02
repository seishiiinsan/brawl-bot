import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name} (voir .env.example)`);
  return value;
}

export const config = {
  root,
  discord: {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    guildId: process.env.DISCORD_GUILD_ID || null,
  },
  brawl: {
    apiKey: required('BRAWL_API_KEY'),
    baseUrl: (process.env.BRAWL_API_BASE || 'https://api.brawlstars.com/v1').replace(/\/$/, ''),
  },
  db: {
    file: process.env.DATABASE_FILE || path.join(root, 'data', 'brawl.db'),
  },
  snapshots: {
    cron: process.env.SNAPSHOT_CRON || '0 * * * *',
    retentionDays: Number(process.env.SNAPSHOT_RETENTION_DAYS || 120),
  },
};

export const COLORS = {
  primary: 0xffcc00,
  success: 0x43b581,
  danger: 0xed4245,
  neutral: 0x2b2d31,
};
