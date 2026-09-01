import { SlashCommandBuilder } from 'discord.js';
import { assets, rankEmoji } from '../api/assets.js';
import { UserError } from '../utils/errors.js';
import { fetchAndRecord, computeProgress, deepStats } from '../services/statsService.js';
import { num, delta, deltaEmoji, percent, bar } from '../utils/format.js';
import { baseEmbed, resolveTag, table } from './_shared.js';

export const data = new SlashCommandBuilder()
  .setName('profil')
  .setDescription('Fiche complète d’un joueur Brawl Stars (stats poussées + progression 24 h)')
  .addStringOption((o) =>
    o.setName('tag').setDescription('Tag du joueur, ex. #2G0JR8VQ').setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('membre').setDescription('Un membre du serveur ayant lié son compte').setRequired(false),
  );

export async function execute(interaction) {
  const resolved = resolveTag(interaction);
  if (resolved.error) throw new UserError(resolved.error);

  await interaction.deferReply();
  const { player, current } = await fetchAndRecord(resolved.tag, { withBattles: true });
  const stats = deepStats(player);
  const day = computeProgress(player.tag, current, '24h');
  const week = computeProgress(player.tag, current, '7j');

  const embed = baseEmbed(player)
    .setTitle(`${player.name} — ${num(player.trophies)} 🏆`)
    .setThumbnail(assets.playerIcon(player.icon?.id ?? 28000000))
    .setURL(`https://brawlify.com/stats/profile/${player.tag.replace('#', '')}`);

  const description = [
    `**Record** ${num(player.highestTrophies)} 🏆 · **Niveau** ${player.expLevel} (${num(player.expPoints)} XP)`,
    player.club?.tag
      ? `**Club** ${player.club.name} (\`${player.club.tag}\`)`
      : '**Club** aucun',
  ];
  if (day.baseline) {
    description.push(
      `${deltaEmoji(day.deltas.trophies)} **24 h** ${delta(day.deltas.trophies)} 🏆 · ` +
        `**7 j** ${delta(week.deltas.trophies)} 🏆`,
    );
  } else {
    description.push('_Premier relevé enregistré : la progression sera disponible dès la prochaine consultation._');
  }
  embed.setDescription(description.join('\n'));

  embed.addFields(
    {
      name: '🏅 Victoires',
      value: table(
        [
          ['3 c 3', num(player['3vs3Victories'])],
          ['Solo', num(player.soloVictories)],
          ['Duo', num(player.duoVictories)],
          ['Total', num(stats.winsTotal)],
        ],
        ['left', 'right'],
      ).replace(/^/gm, ''),
      inline: true,
    },
    {
      name: '🧩 Collection',
      value: table(
        [
          ['Brawlers', num(stats.owned)],
          ['Niv. 11+', num(stats.maxed)],
          ['Puiss. moy.', stats.averagePower.toFixed(1).replace('.', ',')],
          ['Rang moy.', stats.averageRank.toFixed(1).replace('.', ',')],
        ],
        ['left', 'right'],
      ),
      inline: true,
    },
    {
      name: '⚙️ Déblocages',
      value: table(
        [
          ['Gadgets', num(stats.gadgets)],
          ['Pouvoirs', num(stats.starPowers)],
          ['Équip.', num(stats.gears)],
        ],
        ['left', 'right'],
      ),
      inline: true,
    },
  );

  const paliers = [
    ['Rang 35+', stats.rank35Plus],
    ['Rang 30+', stats.rank30Plus],
    ['Rang 25+', stats.rank25Plus],
    ['Niveau 11', stats.maxed],
  ];
  embed.addFields({
    name: '📊 Paliers',
    value: paliers
      .map(([label, value]) => {
        const ratio = stats.owned ? value / stats.owned : 0;
        return `\`${label.padEnd(9)}\` ${bar(ratio)} ${String(value).padStart(3)}/${stats.owned} (${percent(ratio * 100, 0)})`;
      })
      .join('\n'),
  });

  const topBrawlers = stats.sorted.slice(0, 5);
  if (topBrawlers.length) {
    embed.addFields({
      name: '⭐ Meilleurs brawlers',
      value: topBrawlers
        .map(
          (b, i) =>
            `**${i + 1}.** ${rankEmoji(b.rank)} **${b.name}** — ${num(b.trophies)} 🏆 ` +
            `(record ${num(b.highestTrophies)}, rang ${b.rank}, niv. ${b.power})`,
        )
        .join('\n'),
    });
  }

  const footer = [`Dette de trophées : ${num(stats.trophyDebt)}`];
  if (day.baseline) footer.push(`référence 24 h prise ${new Date(day.baseline.taken_at).toLocaleString('fr-FR')}`);
  embed.setFooter({ text: footer.join(' · ') });

  await interaction.editReply({ embeds: [embed] });
}
