import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { COLORS } from '../config.js';
import { snapshots, tracking } from '../db/repository.js';
import { db } from '../db/database.js';

export const data = new SlashCommandBuilder()
  .setName('aide')
  .setDescription('Mode d’emploi du bot et état du suivi');

export async function execute(interaction) {
  const totalSnapshots = db.prepare('SELECT COUNT(*) AS n FROM snapshots').get().n;
  const totalPlayers = db.prepare('SELECT COUNT(*) AS n FROM players').get().n;
  const totalBattles = db.prepare('SELECT COUNT(*) AS n FROM battles').get().n;

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('📖 Brawl Bot — commandes')
    .setDescription(
      'Toutes les commandes acceptent un `tag` explicite. Si tu as fait `/lier` une fois, ' +
        'tu peux les utiliser sans rien préciser — et `membre:@pseudo` cible quelqu’un d’autre du serveur.',
    )
    .addFields(
      {
        name: '👤 Profils',
        value:
          '`/profil` — fiche complète : trophées, victoires, paliers de rangs, top brawlers, progression 24 h / 7 j\n' +
          '`/brawlers` — classement des brawlers (trophées, rang, puissance, écart au record) + graphique\n' +
          '`/comparer` — deux joueurs côte à côte avec courbes superposées',
      },
      {
        name: '📈 Progression',
        value:
          '`/stats` — ce qui a bougé sur 24 h, 7 j, 30 j : trophées, victoires, XP, rythme par jour, brawlers\n' +
          '`/graph` — courbe d’évolution (trophées, victoires, XP, brawlers, rangs) sur la période choisie\n' +
          '`/combats` — winrate par mode et par brawler, derniers matchs, bilan de trophées',
      },
      {
        name: '⚙️ Configuration',
        value:
          '`/lier` — associe ton compte Discord à ton tag\n' +
          '`/suivi ajouter` — relevé automatique régulier : c’est ce qui remplit les graphiques\n' +
          '`/suivi liste` · `/suivi retirer` — gérer les joueurs suivis\n' +
          '`/club` — statistiques d’un club et de ses membres',
      },
      {
        name: 'ℹ️ Comment l’historique se construit',
        value:
          'L’API Brawl Stars ne renvoie qu’un instantané (et les 25 derniers combats). Le bot enregistre ' +
          'un relevé à chaque commande **et** automatiquement pour les joueurs suivis : les écarts 24 h / 7 j ' +
          'et les courbes se calculent à partir de cette base locale.',
      },
      {
        name: '📊 État de la base',
        value:
          `**${totalPlayers}** joueurs connus · **${totalSnapshots}** relevés · ` +
          `**${totalBattles}** combats archivés · **${tracking.count()}** joueurs en suivi automatique`,
      },
    )
    .setFooter({ text: 'Données : API officielle Brawl Stars · Images : Brawlify' });

  await interaction.reply({ embeds: [embed] });
}
