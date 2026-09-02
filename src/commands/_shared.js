import { EmbedBuilder } from 'discord.js';
import { COLORS } from '../config.js';
import { normalizeTag } from '../utils/tag.js';
import { links } from '../db/repository.js';

/**
 * Determine le tag cible : option explicite > mention d'un membre lie > compte lie de l'auteur.
 * Renvoie { tag } ou { error } avec un message pret a afficher.
 */
export function resolveTag(interaction, { optionName = 'tag', userOption = 'membre' } = {}) {
  const raw = interaction.options.getString?.(optionName);
  if (raw) {
    const tag = normalizeTag(raw);
    if (!tag) {
      return {
        error:
          `\`${raw}\` n'est pas un tag valide. Un tag ressemble à \`#2G0JR8VQ\` ` +
          '(visible dans le jeu, sous ton pseudo, en haut à gauche du profil).',
      };
    }
    return { tag };
  }

  const member = interaction.options.getUser?.(userOption);
  if (member) {
    const linked = links.get(member.id);
    if (!linked) {
      return { error: `${member.username} n'a pas encore lié de compte. Il peut le faire avec \`/lier\`.` };
    }
    return { tag: linked };
  }

  const own = links.get(interaction.user.id);
  if (own) return { tag: own };

  return {
    error:
      'Donne un tag (`tag:#2G0JR8VQ`) ou lie ton compte une fois pour toutes avec `/lier tag:#2G0JR8VQ`.',
  };
}

export function baseEmbed(player, { color = COLORS.primary } = {}) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `${player.name} · ${player.tag}` })
    .setTimestamp();
}

export function errorEmbed(message) {
  return new EmbedBuilder().setColor(COLORS.danger).setDescription(`❌ ${message}`);
}

/** Colonnes alignees en bloc de code : bien plus lisible que des champs d'embed. */
export function table(rows, aligns = []) {
  if (rows.length === 0) return '';
  const widths = rows[0].map((_, col) =>
    Math.max(...rows.map((row) => String(row[col] ?? '').length)),
  );
  return rows
    .map((row) =>
      row
        .map((cell, col) => {
          const text = String(cell ?? '');
          return aligns[col] === 'right'
            ? text.padStart(widths[col])
            : text.padEnd(widths[col]);
        })
        .join('  ')
        .trimEnd(),
    )
    .join('\n');
}
