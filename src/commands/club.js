import { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { brawlApi } from '../api/brawlstars.js';
import { assets } from '../api/assets.js';
import { COLORS } from '../config.js';
import { UserError } from '../utils/errors.js';
import { normalizeTag } from '../utils/tag.js';
import { links } from '../db/repository.js';
import { renderBarChart } from '../charts/renderer.js';
import { num } from '../utils/format.js';
import { table } from './_shared.js';

const TYPE_LABELS = { open: 'Ouvert', inviteOnly: 'Sur invitation', closed: 'Fermé', unknown: '—' };
const ROLE_LABELS = {
  president: 'Président',
  vicePresident: 'Vice-président',
  senior: 'Ancien',
  member: 'Membre',
};

export const data = new SlashCommandBuilder()
  .setName('club')
  .setDescription('Statistiques d’un club : membres, trophées, répartition')
  .addStringOption((o) =>
    o.setName('tag').setDescription('Tag du club, ou d’un joueur pour prendre son club'),
  );

export async function execute(interaction) {
  const raw = interaction.options.getString('tag');
  let tag = raw ? normalizeTag(raw) : null;
  if (raw && !tag) throw new UserError(`\`${raw}\` n'est pas un tag valide.`);

  await interaction.deferReply();

  let club = null;
  if (tag) {
    // On tente le club ; si le tag est en fait celui d'un joueur, on bascule sur son club.
    try {
      club = await brawlApi.getClub(tag);
    } catch (error) {
      if (error.status !== 404) throw error;
      const player = await brawlApi.getPlayer(tag);
      if (!player.club?.tag) throw new UserError(`**${player.name}** n'est dans aucun club.`);
      club = await brawlApi.getClub(player.club.tag);
    }
  } else {
    const own = links.get(interaction.user.id);
    if (!own) throw new UserError('Donne un tag de club, ou lie ton compte avec `/lier`.');
    const player = await brawlApi.getPlayer(own);
    if (!player.club?.tag) throw new UserError('Tu n’es dans aucun club.');
    club = await brawlApi.getClub(player.club.tag);
  }

  const members = [...(club.members ?? [])].sort((a, b) => b.trophies - a.trophies);
  const trophies = members.map((m) => m.trophies);
  const average = trophies.length ? club.trophies / trophies.length : 0;

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`${club.name} — ${num(club.trophies)} 🏆`)
    .setURL(`https://brawlify.com/stats/club/${club.tag.replace('#', '')}`)
    .setThumbnail(assets.clubBadge(club.badgeId))
    .setDescription(club.description || '_Aucune description._')
    .addFields(
      {
        name: 'Club',
        value: table(
          [
            ['Tag', club.tag],
            ['Type', TYPE_LABELS[club.type] ?? club.type],
            ['Requis', num(club.requiredTrophies)],
            ['Membres', `${members.length}/30`],
          ],
          ['left', 'right'],
        ),
        inline: true,
      },
      {
        name: 'Trophées',
        value: table(
          [
            ['Total', num(club.trophies)],
            ['Moyenne', num(average)],
            ['Max', num(Math.max(0, ...trophies))],
            ['Min', num(Math.min(...trophies, 0))],
          ],
          ['left', 'right'],
        ),
        inline: true,
      },
    );

  embed.addFields({
    name: '🏆 Top 10 membres',
    value: members
      .slice(0, 10)
      .map(
        (m, i) =>
          `**${i + 1}.** ${m.name} — ${num(m.trophies)} 🏆 · _${ROLE_LABELS[m.role] ?? m.role}_`,
      )
      .join('\n'),
  });

  const png = renderBarChart({
    title: `${club.name} · répartition des trophées`,
    subtitle: `${members.length} membres — moyenne ${num(average)} 🏆`,
    items: members.slice(0, 20).map((m) => ({
      label: m.name,
      value: m.trophies,
      hint: ROLE_LABELS[m.role] ?? m.role,
    })),
    footer: `Total du club : ${num(club.trophies)} 🏆`,
  });
  embed.setImage('attachment://club.png');

  await interaction.editReply({
    embeds: [embed],
    files: [new AttachmentBuilder(png, { name: 'club.png' })],
  });
}
