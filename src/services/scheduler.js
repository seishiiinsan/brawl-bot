import cron from 'node-cron';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { tracking, purgeOldData } from '../db/repository.js';
import { fetchAndRecord } from './statsService.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Prend un releve pour chaque joueur suivi. Les appels sont espaces :
 * l'API Brawl Stars limite le debit et rien ne presse ici.
 */
export async function runSnapshots() {
  const players = tracking.list();
  if (players.length === 0) return { ok: 0, failed: 0 };

  let ok = 0;
  let failed = 0;
  for (const player of players) {
    try {
      await fetchAndRecord(player.tag, { withBattles: true });
      ok += 1;
    } catch (error) {
      failed += 1;
      logger.warn(`Relevé impossible pour ${player.tag} : ${error.message}`);
    }
    await sleep(400);
  }

  logger.info(`Relevés automatiques : ${ok} réussis, ${failed} en échec.`);
  return { ok, failed };
}

export function startScheduler() {
  if (!cron.validate(config.snapshots.cron)) {
    logger.error(`SNAPSHOT_CRON invalide (« ${config.snapshots.cron} ») : suivi automatique désactivé.`);
    return null;
  }

  const task = cron.schedule(config.snapshots.cron, () => {
    runSnapshots().catch((error) => logger.error(`Relevés automatiques : ${error.message}`));
  });

  // Menage quotidien a 4 h du matin.
  cron.schedule('0 4 * * *', () => {
    const removed = purgeOldData();
    if (removed > 0) logger.info(`Purge : ${removed} lignes au-delà de la rétention supprimées.`);
  });

  logger.info(`Suivi automatique planifié (${config.snapshots.cron}).`);
  return task;
}
