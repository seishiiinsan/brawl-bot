import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { UserError } from '../utils/errors.js';
import { PERIODS, fetchAndRecord, series } from '../services/statsService.js';
import { renderLineChart, THEME } from '../charts/renderer.js';
import { delta, num } from '../utils/format.js';
import { baseEmbed, resolveTag } from './_shared.js';
import { snapshots } from '../db/repository.js';

const METRICS = {
  trophies: { column: 'trophies', label: 'Trophées', unit: '🏆' },
  highest: { column: 'highest_trophies', label: 'Record de trophées', unit: '🏆' },
  wins3v3: { column: 'wins_3v3', label: 'Victoires 3 c 3', unit: '' },
  winsSolo: { column: 'wins_solo', label: 'Victoires solo', unit: '' },
  winsDuo: { column: 'wins_duo', label: 'Victoires duo', unit: '' },
  xp: { column: 'exp_points', label: 'Points d’expérience', unit: 'XP' },
  brawlers: { column: 'brawlers_owned', label: 'Brawlers débloqués', unit: '' },
  ranks: { column: 'rank_total', label: 'Somme des rangs', unit: '' },
};

export const data = new SlashCommandBuilder()
  .setName('graph')
  .setDescription('Courbe d’évolution (trophées, victoires, XP…) sur une période')
  .addStringOption((o) =>
    o
      .setName('periode')
      .setDescription('Période affichée (défaut : 7 j)')
      .addChoices(
        { name: 'Dernières 24 heures', value: '24h' },
        { name: '7 derniers jours', value: '7j' },
        { name: '30 derniers jours', value: '30j' },
        { name: 'Tout l’historique', value: 'all' },
      ),
  )
  .addStringOption((o) =>
    o
      .setName('metrique')
      .setDescription('Donnée tracée (défaut : trophées)')
      .addChoices(
        { name: 'Trophées', value: 'trophies' },
        { name: 'Record de trophées', value: 'highest' },
        { name: 'Victoires 3c3', value: 'wins3v3' },
        { name: 'Victoires solo', value: 'winsSolo' },
        { name: 'Victoires duo', value: 'winsDuo' },
        { name: 'Expérience', value: 'xp' },
        { name: 'Brawlers débloqués', value: 'brawlers' },
        { name: 'Somme des rangs', value: 'ranks' },
      ),
  )
  .addStringOption((o) => o.setName('tag').setDescription('Tag du joueur, ex. #2G0JR8VQ'))
  .addUserOption((o) => o.setName('membre').setDescription('Un membre ayant lié son compte'));

export async function execute(interaction) {
  const resolved = resolveTag(interaction);
  if (resolved.error) throw new UserError(resolved.error);

  const periodKey = interaction.options.getString('periode') ?? '7j';
  const metricKey = interaction.options.getString('metrique') ?? 'trophies';
  const metric = METRICS[metricKey];

  await interaction.deferReply();
  const { player } = await fetchAndRecord(resolved.tag);

  const points = series(player.tag, periodKey, metric.column);
  if (points.length < 2) {
    throw new UserError(
      `Il n'y a qu'un seul relevé pour **${player.name}** : impossible de tracer une courbe.\n` +
        'Ajoute le joueur au suivi automatique (`/suivi ajouter`) — un point sera enregistré chaque heure.',
    );
  }

  const first = points[0];
  const last = points.at(-1);
  const change = last.v - first.v;

  const png = renderLineChart({
    title: `${player.name} · ${metric.label}`,
    subtitle: `${PERIODS[periodKey].label} — ${points.length} relevés`,
    footer: `${num(first.v)} → ${num(last.v)} (${delta(change)})`,
    series: [
      {
        label: metric.label,
        points,
        color: change >= 0 ? THEME.accent : THEME.negative,
      },
    ],
  });

  const file = new AttachmentBuilder(png, { name: 'graph.png' });
  const total = snapshots.count(player.tag);
  const embed = baseEmbed(player)
    .setTitle(`${metric.label} — ${PERIODS[periodKey].label}`)
    .setDescription(
      `**${num(last.v)}** ${metric.unit} · variation **${delta(change)}** sur la période`,
    )
    .setImage('attachment://graph.png')
    .setFooter({ text: `${total} relevés en base pour ce joueur` });

  await interaction.editReply({ embeds: [embed], files: [file] });
}
