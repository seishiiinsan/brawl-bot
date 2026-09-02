import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { COLORS } from '../config.js';
import { UserError } from '../utils/errors.js';
import { normalizeTag } from '../utils/tag.js';
import { links } from '../db/repository.js';
import { fetchAndRecord } from '../services/statsService.js';
import { num } from '../utils/format.js';

export const data = new SlashCommandBuilder()
  .setName('lier')
  .setDescription('Associe ton compte Discord à un tag Brawl Stars (plus besoin de le retaper)')
  .addStringOption((o) =>
    o.setName('tag').setDescription('Ton tag, ex. #2G0JR8VQ').setRequired(false),
  )
  .addBooleanOption((o) =>
    o.setName('supprimer').setDescription('Supprime le lien existant').setRequired(false),
  );

export async function execute(interaction) {
  if (interaction.options.getBoolean('supprimer')) {
    const removed = links.remove(interaction.user.id);
    await interaction.reply({
      content: removed ? '🔓 Lien supprimé.' : 'Aucun compte n’était lié.',
      ephemeral: true,
    });
    return;
  }

  const raw = interaction.options.getString('tag');
  if (!raw) {
    const current = links.get(interaction.user.id);
    await interaction.reply({
      content: current
        ? `Ton compte est lié à \`${current}\`. Pour changer : \`/lier tag:#NOUVEAUTAG\`.`
        : 'Aucun compte lié. Utilise `/lier tag:#2G0JR8VQ`.',
      ephemeral: true,
    });
    return;
  }

  const tag = normalizeTag(raw);
  if (!tag) throw new UserError(`\`${raw}\` n'est pas un tag valide (ex. \`#2G0JR8VQ\`).`);

  await interaction.deferReply({ ephemeral: true });
  const { player } = await fetchAndRecord(tag, { withBattles: true });
  links.set(interaction.user.id, player.tag);

  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle('✅ Compte lié')
    .setDescription(
      `Ton compte Discord est maintenant lié à **${player.name}** (\`${player.tag}\`, ${num(player.trophies)} 🏆).\n` +
        'Tu peux désormais utiliser `/profil`, `/stats`, `/graph`… sans préciser de tag.',
    );

  await interaction.editReply({ embeds: [embed] });
}
