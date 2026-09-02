import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { brawlApi } from '../api/brawlstars.js';
import { modeEmoji, modeLabel } from '../api/assets.js';
import { COLORS } from '../config.js';
import { UserError } from '../utils/errors.js';
import { PERIODS, battleStats, fetchAndRecord } from '../services/statsService.js';
import { renderBarChart, THEME } from '../charts/renderer.js';
import { delta, parseBattleTime, percent, relative } from '../utils/format.js';
import { baseEmbed, resolveTag } from './_shared.js';

export const data = new SlashCommandBuilder()
  .setName('combats')
  .setDescription('Analyse des combats : winrate par mode, par brawler, derniers matchs')
  .addStringOption((o) =>
    o
      .setName('periode')
      .setDescription('Période analysée (défaut : 24 h)')
      .addChoices(
        { name: 'Dernières 24 heures', value: '24h' },
        { name: '7 derniers jours', value: '7j' },
        { name: '30 derniers jours', value: '30j' },
        { name: 'Tout l’archivé', value: 'all' },
      ),
  )
  .addStringOption((o) => o.setName('tag').setDescription('Tag du joueur, ex. #2G0JR8VQ'))
  .addUserOption((o) => o.setName('membre').setDescription('Un membre ayant lié son compte'));

export async function execute(interaction) {
  const resolved = resolveTag(interaction);
  if (resolved.error) throw new UserError(resolved.error);
  const periodKey = interaction.options.getString('periode') ?? '24h';

  await interaction.deferReply();
  const { player } = await fetchAndRecord(resolved.tag, { withBattles: true });
  const stats = battleStats(player.tag, periodKey);

  if (stats.total === 0) {
    throw new UserError(
      `Aucun combat archivé pour **${player.name}** sur cette période.\n` +
        "L'API ne donne que les 25 derniers combats : le bot les archive à chaque consultation, " +
        'donc l’historique se remplit au fil du temps (ou automatiquement via `/suivi ajouter`).',
    );
  }

  const embed = baseEmbed(player, {
    color: (stats.winrate ?? 0) >= 50 ? COLORS.success : COLORS.danger,
  })
    .setTitle(`Combats de ${player.name} — ${PERIODS[periodKey].label}`)
    .setDescription(
      `**${stats.total} combats** · **${stats.victories}V / ${stats.defeats}D` +
        (stats.draws ? ` / ${stats.draws}N` : '') +
        `** · winrate **${percent(stats.winrate ?? 0)}**\n` +
        `${delta(stats.trophyChange)} 🏆 sur la période · ⭐ Meilleur joueur **${stats.starPlayer}** fois`,
    );

  embed.addFields({
    name: '🎮 Par mode de jeu',
    value: stats.modes
      .slice(0, 8)
      .map(
        (m) =>
          `${modeEmoji(m.key)} **${modeLabel(m.key)}** · ${m.total} combats · ` +
          `${percent(m.winrate ?? 0, 0)} · ${delta(m.trophyChange)} 🏆`,
      )
      .join('\n'),
  });

  const topBrawlers = stats.brawlers.filter((b) => b.total >= 2).slice(0, 8);
  if (topBrawlers.length) {
    embed.addFields({
      name: '🧩 Par brawler (2 combats min.)',
      value: topBrawlers
        .map(
          (b) =>
            `**${b.key}** · ${b.total} combats · ${percent(b.winrate ?? 0, 0)} · ${delta(b.trophyChange)} 🏆`,
        )
        .join('\n'),
    });
  }

  // Les 25 derniers combats bruts viennent de l'API : ils donnent le detail immediat.
  let recent = [];
  try {
    const log = await brawlApi.getBattleLog(player.tag);
    recent = (log.items ?? []).slice(0, 5);
  } catch {
    /* deja archive, pas bloquant */
  }
  if (recent.length) {
    embed.addFields({
      name: '🕒 Derniers combats',
      value: recent
        .map((item) => {
          const b = item.battle ?? {};
          const result =
            b.result === 'victory'
              ? '🟢 Victoire'
              : b.result === 'defeat'
                ? '🔴 Défaite'
                : b.result === 'draw'
                  ? '🟡 Nul'
                  : b.rank != null
                    ? `#${b.rank}`
                    : '—';
          const change = b.trophyChange ? ` (${delta(b.trophyChange)} 🏆)` : '';
          return `${modeEmoji(b.mode)} ${result}${change} · ${modeLabel(b.mode ?? item.event?.mode)} — ${item.event?.map ?? 'carte inconnue'} · ${relative(parseBattleTime(item.battleTime))}`;
        })
        .join('\n'),
    });
  }

  const chartItems = stats.modes.slice(0, 10).map((m) => ({
    label: modeLabel(m.key),
    value: Math.round(m.winrate ?? 0),
    hint: `${m.total} combats`,
    color: (m.winrate ?? 0) >= 50 ? THEME.positive : THEME.negative,
  }));
  const png = renderBarChart({
    title: `${player.name} · winrate par mode`,
    subtitle: `${PERIODS[periodKey].label} — ${stats.total} combats archivés`,
    items: chartItems,
    valueFormat: (v) => `${v} %`,
    footer: `Winrate global ${percent(stats.winrate ?? 0)} · ${delta(stats.trophyChange)} 🏆`,
  });

  embed.setImage('attachment://combats.png');
  await interaction.editReply({
    embeds: [embed],
    files: [new AttachmentBuilder(png, { name: 'combats.png' })],
  });
}
