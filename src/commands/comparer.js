import { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { COLORS } from '../config.js';
import { PERIODS, computeProgress, deepStats, fetchAndRecord, series } from '../services/statsService.js';
import { renderLineChart, THEME } from '../charts/renderer.js';
import { delta, num, percent } from '../utils/format.js';
import { normalizeTag } from '../utils/tag.js';
import { links } from '../db/repository.js';
import { table } from './_shared.js';

export const data = new SlashCommandBuilder()
  .setName('comparer')
  .setDescription('Compare deux profils côte à côte, avec courbes superposées')
  .addStringOption((o) => o.setName('joueur1').setDescription('Tag du premier joueur').setRequired(true))
  .addStringOption((o) => o.setName('joueur2').setDescription('Tag du second joueur').setRequired(false))
  .addUserOption((o) => o.setName('membre2').setDescription('Ou un membre ayant lié son compte'))
  .addStringOption((o) =>
    o
      .setName('periode')
      .setDescription('Période des courbes (défaut : 7 j)')
      .addChoices(
        { name: 'Dernières 24 heures', value: '24h' },
        { name: '7 derniers jours', value: '7j' },
        { name: '30 derniers jours', value: '30j' },
        { name: 'Tout l’historique', value: 'all' },
      ),
  );

export async function execute(interaction) {
  const tag1 = normalizeTag(interaction.options.getString('joueur1'));
  if (!tag1) throw new UserError('Le tag du premier joueur est invalide (ex. `#2G0JR8VQ`).');

  const rawTag2 = interaction.options.getString('joueur2');
  const member2 = interaction.options.getUser('membre2');
  let tag2 = rawTag2 ? normalizeTag(rawTag2) : member2 ? links.get(member2.id) : links.get(interaction.user.id);
  if (!tag2) {
    throw new UserError(
      'Indique un second joueur : `joueur2:#TAG`, `membre2:@pseudo`, ou lie ton propre compte avec `/lier`.',
    );
  }
  if (tag1 === tag2) throw new UserError('Ce sont deux fois le même joueur 🙂');

  const periodKey = interaction.options.getString('periode') ?? '7j';
  await interaction.deferReply();

  const [a, b] = await Promise.all([fetchAndRecord(tag1), fetchAndRecord(tag2)]);
  const statsA = deepStats(a.player);
  const statsB = deepStats(b.player);
  const progA = computeProgress(a.player.tag, a.current, periodKey);
  const progB = computeProgress(b.player.tag, b.current, periodKey);

  const rows = [
    ['', a.player.name.slice(0, 14), b.player.name.slice(0, 14)],
    ['Trophées', num(a.player.trophies), num(b.player.trophies)],
    ['Record', num(a.player.highestTrophies), num(b.player.highestTrophies)],
    ['Niveau', String(a.player.expLevel), String(b.player.expLevel)],
    ['Victoires', num(statsA.winsTotal), num(statsB.winsTotal)],
    ['Brawlers', num(statsA.owned), num(statsB.owned)],
    ['Niveau 11', num(statsA.maxed), num(statsB.maxed)],
    ['Rang moyen', statsA.averageRank.toFixed(1), statsB.averageRank.toFixed(1)],
    ['Rang 30+', num(statsA.rank30Plus), num(statsB.rank30Plus)],
    [PERIODS[periodKey].label.slice(0, 12), delta(progA.deltas.trophies ?? 0), delta(progB.deltas.trophies ?? 0)],
  ];

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`${a.player.name} vs ${b.player.name}`)
    .setDescription(`\`\`\`\n${table(rows, ['left', 'right', 'right'])}\n\`\`\``)
    .setTimestamp();

  const gap = a.player.trophies - b.player.trophies;
  embed.addFields({
    name: 'Écart',
    value:
      `**${num(Math.abs(gap))} 🏆** d'écart en faveur de **${gap >= 0 ? a.player.name : b.player.name}** · ` +
      `${percent((Math.min(a.player.trophies, b.player.trophies) / Math.max(a.player.trophies, b.player.trophies)) * 100, 0)} du total du leader`,
  });

  const pointsA = series(a.player.tag, periodKey, 'trophies');
  const pointsB = series(b.player.tag, periodKey, 'trophies');
  const files = [];
  if (pointsA.length >= 2 || pointsB.length >= 2) {
    const png = renderLineChart({
      title: `${a.player.name} vs ${b.player.name}`,
      subtitle: `Trophées — ${PERIODS[periodKey].label}`,
      series: [
        { label: a.player.name, points: pointsA, color: THEME.series[0] },
        { label: b.player.name, points: pointsB, color: THEME.series[1] },
      ],
    });
    files.push(new AttachmentBuilder(png, { name: 'comparaison.png' }));
    embed.setImage('attachment://comparaison.png');
  } else {
    embed.setFooter({ text: 'Pas encore assez d’historique pour tracer les courbes.' });
  }

  await interaction.editReply({ embeds: [embed], files });
}
