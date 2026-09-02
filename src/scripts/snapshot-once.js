/** Releve unique pour tous les joueurs suivis (utile en cron systeme ou pour tester). */
import { runSnapshots } from '../services/scheduler.js';
import { closeDatabase } from '../db/database.js';
import { logger } from '../utils/logger.js';

const result = await runSnapshots();
logger.info(`Terminé : ${result.ok} relevés, ${result.failed} échecs.`);
closeDatabase();
