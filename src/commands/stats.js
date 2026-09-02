import { SlashCommandBuilder } from 'discord.js';
import { assets, modeEmoji, modeLabel } from '../api/assets.js';
import { COLORS } from '../config.js';
import { UserError } from '../utils/errors.js';
import {
  PERIODS,
  battleStats,
  brawlerMovers,
  computeProgress,
  fetchAndRecord,
} from '../services/statsService.js';
import { num, delta, deltaEmoji, percent, humanSpan } from '../utils/format.js';
import { baseEmbed, resolveTag, table } from './_shared.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('Progression détaillée sur une période (24 h, 7 j, 30 j…)')
  .addStringOption((o) =>
    o
      .setName('periode')
      .setDescription('Période analysée (défaut : 24 h)')
      .addChoices(
        { name: 'Dernières 24 heures', value: '24h' },
        { name: '7 derniers jours', value: '7j' },
        { name: '30 derniers jours', value: '30j' },
        { name: 'Depuis le début du suivi', value: 'all' },
      ),
  )
  .addStringOption((o) => o.setName('tag').setDescription('Tag du joueur, ex. #2G0JR8VQ'))
  .addUserOption((o) => o.setName('membre').setDescription('Un membre ayant lié son compte'));

export async function execute(interaction) {
  const resolved = resolveTag(interaction);
  if (resolved.error) throw new UserError(resolved.error);
  const periodKey = interaction.options.getString('periode') ?? '24h';

  await interaction.deferReply();
  const { player, snapshotId, current } = await fetchAndRecord(resolved.tag, { withBattles: true });
  const progress = computeProgress(player.tag, current, periodKey);

  if (!progress.baseline) {
    throw new UserError(
      `Aucun historique pour **${player.name}**. Le premier relevé vient d'être enregistré : ` +
        'reviens dans quelques heures, ou ajoute le joueur au suivi automatique avec `/suivi ajouter`.',
    );
  }

  const { deltas } = progress;
  const embed = baseEmbed(player, {
    color: deltas.trophies >= 0 ? COLORS.success : COLORS.danger,
  })
    .setTitle(`${player.name} — ${PERIODS[periodKey].label}`)
    .setThumbnail(assets.playerIcon(player.icon?.id ?? 28000000))
    .setDescription(
      `${deltaEmoji(deltas.trophies)} **${delta(deltas.trophies)} 🏆** ` +
        `(${num(progress.baseline.trophies)} → **${num(current.trophies)}**)` +
        (deltas.highestTrophies > 0 ? `\n🎯 Nouveau record : +${num(deltas.highestTrophies)} 🏆` : ''),
    );

  embed.addFields(
    {
      name: '🏅 Victoires gagnées',
      value: table(
        [
          ['3 c 3', delta(deltas.wins3v3)],
          ['Solo', delta(deltas.winsSolo)],
          ['Duo', delta(deltas.winsDuo)],
          ['Total', delta(deltas.winsTotal)],
        ],
        ['left', 'right'],
      ),
      inline: true,
    },
    {
      name: '📈 Progression',
      value: table(
        [
          ['XP', delta(deltas.expPoints)],
          ['Niveaux', delta(deltas.expLevel)],
          ['Brawlers', delta(deltas.brawlersOwned)],
          ['Rangs', delta(deltas.rankTotal)],
        ],
        ['left', 'right'],
      ),
      inline: true,
    },
  );

  // Rythme : utile pour se projeter ("+X 🏆/jour").
  const days = Math.max(progress.coveredMs / 86_400_000, 1 / 24);
  embed.addFields({
    name: '⏱️ Rythme',
    value:
      `**${delta(Math.round(deltas.trophies / days))} 🏆/jour** · ` +
      `**${delta(Math.round((deltas.winsTotal / days) * 10) / 10)} victoire(s)/jour** · ` +
      `**${delta(Math.round(deltas.expPoints / days))} XP/jour**\n` +
      `_Calculé sur ${humanSpan(progress.coveredMs)} d'historique réel._`,
    inline: false,
  });

  const combat = battleStats(player.tag, periodKey);
  if (combat.total > 0) {
    const modes = combat.modes
      .slice(0, 5)
      .map(
        (m) =>
          `${modeEmoji(m.key)} **${modeLabel(m.key)}** — ${m.total} combats · ` +
          `${percent(m.winrate ?? 0, 0)} · ${delta(m.trophyChange)} 🏆`,
      )
      .join('\n');
    embed.addFields({
      name: `⚔️ Combats archivés (${combat.total})`,
      value:
        `**${combat.victories}V / ${combat.defeats}D** · winrate **${percent(combat.winrate ?? 0)}** · ` +
        `${delta(combat.trophyChange)} 🏆 · ⭐ MVP ×${combat.starPlayer}\n${modes}`,
    });
  }

  const movers = brawlerMovers(player.tag, snapshotId, periodKey, 5);
  if (movers.gains.length || movers.losses.length) {
    const lines = [];
    if (movers.gains.length) {
      lines.push(`📈 ${movers.gains.map((b) => `**${b.name}** ${delta(b.delta)}`).join(' · ')}`);
    }
    if (movers.losses.length) {
      lines.push(`📉 ${movers.losses.map((b) => `**${b.name}** ${delta(b.delta)}`).join(' · ')}`);
    }
    if (movers.newcomers?.length) {
      lines.push(`🆕 Nouveaux : ${movers.newcomers.slice(0, 8).join(', ')}`);
    }
    embed.addFields({ name: '🧩 Brawlers qui ont bougé', value: lines.join('\n') });
  }

  const footerParts = [`Référence : ${new Date(progress.baseline.taken_at).toLocaleString('fr-FR')}`];
  if (progress.partial) {
    footerParts.push("historique plus court que la période demandée");
  }
  footerParts.push('/graph pour la courbe');
  embed.setFooter({ text: footerParts.join(' · ') });

  await interaction.editReply({ embeds: [embed] });
}
