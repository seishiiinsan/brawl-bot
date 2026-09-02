import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { rankEmoji } from '../api/assets.js';
import { UserError } from '../utils/errors.js';
import { deepStats, fetchAndRecord } from '../services/statsService.js';
import { renderBarChart, THEME } from '../charts/renderer.js';
import { num, percent } from '../utils/format.js';
import { baseEmbed, resolveTag, table } from './_shared.js';

const SORTS = {
  trophies: { label: 'trophées actuels', key: (b) => b.trophies },
  highest: { label: 'record de trophées', key: (b) => b.highestTrophies },
  rank: { label: 'rang', key: (b) => b.rank * 100000 + b.trophies },
  power: { label: 'niveau de puissance', key: (b) => b.power * 100000 + b.trophies },
  debt: { label: 'écart au record', key: (b) => b.highestTrophies - b.trophies },
};

export const data = new SlashCommandBuilder()
  .setName('brawlers')
  .setDescription('Classement des brawlers d’un joueur, avec graphique')
  .addStringOption((o) =>
    o
      .setName('tri')
      .setDescription('Critère de classement (défaut : trophées)')
      .addChoices(
        { name: 'Trophées actuels', value: 'trophies' },
        { name: 'Record de trophées', value: 'highest' },
        { name: 'Rang', value: 'rank' },
        { name: 'Niveau de puissance', value: 'power' },
        { name: 'Écart au record (trophées perdus)', value: 'debt' },
      ),
  )
  .addIntegerOption((o) =>
    o.setName('nombre').setDescription('Nombre de brawlers affichés (1-25)').setMinValue(1).setMaxValue(25),
  )
  .addStringOption((o) => o.setName('tag').setDescription('Tag du joueur, ex. #2G0JR8VQ'))
  .addUserOption((o) => o.setName('membre').setDescription('Un membre ayant lié son compte'));

export async function execute(interaction) {
  const resolved = resolveTag(interaction);
  if (resolved.error) throw new UserError(resolved.error);

  const sortKey = interaction.options.getString('tri') ?? 'trophies';
  const limit = interaction.options.getInteger('nombre') ?? 12;
  const sort = SORTS[sortKey];

  await interaction.deferReply();
  const { player } = await fetchAndRecord(resolved.tag);
  const stats = deepStats(player);

  const ranked = [...(player.brawlers ?? [])].sort((a, b) => sort.key(b) - sort.key(a)).slice(0, limit);
  if (ranked.length === 0) throw new UserError('Ce joueur n’a aucun brawler débloqué.');

  const value = (b) =>
    sortKey === 'debt' ? b.highestTrophies - b.trophies : sortKey === 'highest' ? b.highestTrophies : b.trophies;

  const png = renderBarChart({
    title: `${player.name} · top ${ranked.length} brawlers`,
    subtitle: `Classés par ${sort.label} — ${stats.owned} brawlers débloqués`,
    footer: `Total ${num(stats.sorted.reduce((s, b) => s + b.trophies, 0))} 🏆 · moyenne ${num(stats.averageTrophies)} 🏆/brawler`,
    items: ranked.map((b) => ({
      label: b.name,
      value: value(b),
      hint: `rang ${b.rank} · niv. ${b.power}`,
      color: sortKey === 'debt' ? THEME.negative : THEME.series[0],
    })),
  });

  const rows = ranked.map((b, i) => [
    `${i + 1}.`,
    rankEmoji(b.rank),
    b.name,
    num(b.trophies),
    `/${num(b.highestTrophies)}`,
    `R${b.rank}`,
    `P${b.power}`,
  ]);

  const embed = baseEmbed(player)
    .setTitle(`Brawlers de ${player.name} — tri par ${sort.label}`)
    .setDescription(
      `\`\`\`\n${table(rows, ['right', 'left', 'left', 'right', 'left', 'right', 'right'])}\n\`\`\``,
    )
    .addFields({
      name: 'Vue d’ensemble',
      value:
        `Niveau 11 : **${stats.maxed}/${stats.owned}** (${percent((stats.maxed / stats.owned) * 100, 0)}) · ` +
        `Rang 30+ : **${stats.rank30Plus}** · Rang max : **${stats.highestRank}**\n` +
        `Écart total au record : **${num(stats.trophyDebt)} 🏆**`,
    })
    .setImage('attachment://brawlers.png');

  await interaction.editReply({
    embeds: [embed],
    files: [new AttachmentBuilder(png, { name: 'brawlers.png' })],
  });
}
