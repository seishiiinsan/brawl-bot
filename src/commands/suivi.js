import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { COLORS, config } from '../config.js';
import { UserError } from '../utils/errors.js';
import { normalizeTag } from '../utils/tag.js';
import { snapshots, tracking, links } from '../db/repository.js';
import { fetchAndRecord } from '../services/statsService.js';
import { num, relative } from '../utils/format.js';

export const data = new SlashCommandBuilder()
  .setName('suivi')
  .setDescription('Suivi automatique : un relevé enregistré régulièrement pour alimenter les graphiques')
  .addSubcommand((s) =>
    s
      .setName('ajouter')
      .setDescription('Ajoute un joueur au suivi automatique')
      .addStringOption((o) => o.setName('tag').setDescription('Tag du joueur').setRequired(false)),
  )
  .addSubcommand((s) =>
    s
      .setName('retirer')
      .setDescription('Retire un joueur du suivi automatique')
      .addStringOption((o) => o.setName('tag').setDescription('Tag du joueur').setRequired(true)),
  )
  .addSubcommand((s) => s.setName('liste').setDescription('Liste les joueurs suivis'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'liste') {
    const rows = tracking.list();
    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`📡 Suivi automatique — ${rows.length} joueur(s)`)
      .setFooter({ text: `Relevé programmé : ${config.snapshots.cron} (heure du serveur)` });

    embed.setDescription(
      rows.length === 0
        ? 'Personne n’est suivi pour l’instant. Ajoute un joueur avec `/suivi ajouter tag:#TAG`.'
        : rows
            .map((row) => {
              const last = snapshots.latest(row.tag);
              return (
                `• **${row.name ?? 'Inconnu'}** \`${row.tag}\` — ` +
                (last
                  ? `${num(last.trophies)} 🏆, ${snapshots.count(row.tag)} relevés, dernier ${relative(last.taken_at)}`
                  : 'aucun relevé')
              );
            })
            .join('\n')
            .slice(0, 4000),
    );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  const raw = interaction.options.getString('tag');
  const tag = raw ? normalizeTag(raw) : links.get(interaction.user.id);
  if (!tag) {
    throw new UserError(
      raw
        ? `\`${raw}\` n'est pas un tag valide (ex. \`#2G0JR8VQ\`).`
        : 'Indique un tag, ou lie ton compte avec `/lier`.',
    );
  }

  if (sub === 'retirer') {
    const removed = tracking.remove(tag);
    await interaction.reply({
      content: removed
        ? `🛑 \`${tag}\` n'est plus suivi. Son historique est conservé.`
        : `\`${tag}\` n'était pas dans la liste de suivi.`,
    });
    return;
  }

  await interaction.deferReply();
  const { player } = await fetchAndRecord(tag, { withBattles: true });
  const added = tracking.add(player.tag, interaction.user.id, interaction.guildId);

  const embed = new EmbedBuilder()
    .setColor(added ? COLORS.success : COLORS.neutral)
    .setTitle(added ? '📡 Suivi activé' : 'Déjà suivi')
    .setDescription(
      `**${player.name}** (\`${player.tag}\`) — ${num(player.trophies)} 🏆\n` +
        `Un relevé sera pris automatiquement selon la planification \`${config.snapshots.cron}\`, ` +
        'ce qui alimente `/graph` et `/stats` même sans passer de commande.',
    );
  await interaction.editReply({ embeds: [embed] });
}
