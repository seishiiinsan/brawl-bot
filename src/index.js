import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { commands } from './commands/index.js';
import { BrawlApiError } from './api/brawlstars.js';
import { UserError } from './utils/errors.js';
import { errorEmbed } from './commands/_shared.js';
import { startScheduler } from './services/scheduler.js';
import { closeDatabase } from './db/database.js';

// Le bot ne lit aucun message : les commandes slash suffisent, donc aucun intent privilegie.
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (ready) => {
  logger.info(`Connecté en tant que ${ready.user.tag} (${commands.size} commandes).`);
  ready.user.setActivity('Brawl Stars · /aide');
  startScheduler();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) {
    logger.warn(`Commande inconnue reçue : ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    await replyWithError(interaction, error);
  }
});

async function replyWithError(interaction, error) {
  let message;
  if (error instanceof UserError) {
    message = error.message;
  } else if (error instanceof BrawlApiError) {
    message = error.userMessage;
    logger.warn(`API ${error.status} sur /${interaction.commandName} : ${error.message}`);
  } else {
    message = 'Une erreur inattendue est survenue. Réessaie dans un instant.';
    logger.error(`/${interaction.commandName} : ${error.stack ?? error.message}`);
  }

  const payload = { embeds: [errorEmbed(message)] };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
  } catch (replyError) {
    logger.error(`Impossible de répondre à l'interaction : ${replyError.message}`);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    logger.info('Arrêt demandé, fermeture propre…');
    client.destroy();
    closeDatabase();
    process.exit(0);
  });
}

process.on('unhandledRejection', (reason) => {
  logger.error(`Promesse rejetée sans gestionnaire : ${reason?.stack ?? reason}`);
});

client.login(config.discord.token);
