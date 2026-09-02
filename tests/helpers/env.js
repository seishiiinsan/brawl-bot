/**
 * Doit etre importe EN PREMIER dans chaque fichier de test : `config.js` lit
 * l'environnement au chargement du module, donc les variables doivent exister avant.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brawl-bot-test-'));

process.env.DISCORD_TOKEN ??= 'token-de-test';
process.env.DISCORD_CLIENT_ID ??= '000000000000000000';
process.env.BRAWL_API_KEY ??= 'cle-de-test';
process.env.DATABASE_FILE = path.join(dir, 'test.db');

process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));

export const testDir = dir;
