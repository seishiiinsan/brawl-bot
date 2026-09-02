import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { commandsJson } from './commands/index.js';
import { logger } from './utils/logger.js';

const rest = new REST({ version: '10' }).setToken(config.discord.token);

const route = config.discord.guildId
  ? Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId)
  : Routes.applicationCommands(config.discord.clientId);

try {
  const data = await rest.put(route, { body: commandsJson });
  logger.info(
    `${data.length} commandes déployées ${
      config.discord.guildId
        ? `sur le serveur ${config.discord.guildId} (disponibles immédiatement)`
        : 'globalement (jusqu’à 1 h de propagation)'
    }.`,
  );
  for (const command of data) logger.info(`  /${command.name} — ${command.description}`);
} catch (error) {
  logger.error(`Déploiement impossible : ${error.message}`);
  process.exitCode = 1;
}
