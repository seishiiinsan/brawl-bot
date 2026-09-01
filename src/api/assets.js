/** Images fournies par Brawlify (CDN communautaire) : l'API officielle n'en expose pas. */
export const assets = {
  playerIcon: (iconId) => `https://cdn.brawlify.com/profile-icons/regular/${iconId}.png`,
  brawlerIcon: (brawlerId) => `https://cdn.brawlify.com/brawlers/borderless/${brawlerId}.png`,
  clubBadge: (badgeId) => `https://cdn.brawlify.com/club-badges/regular/${badgeId}.png`,
};

const MODE_LABELS = {
  gemGrab: 'Récolte de gemmes',
  brawlBall: 'Brawlball',
  bounty: 'Prime',
  heist: 'Braquage',
  hotZone: 'Zone réservée',
  knockout: 'Hors-jeu',
  siege: 'Siège',
  soloShowdown: 'Showdown solo',
  duoShowdown: 'Showdown duo',
  trioShowdown: 'Showdown trio',
  duels: 'Duels',
  wipeout: 'Élimination',
  basketBrawl: 'Basket Brawl',
  volleyBrawl: 'Volley Brawl',
  brawlBall5v5: 'Brawlball 5c5',
  gemGrab5v5: 'Gemmes 5c5',
  knockout5v5: 'Hors-jeu 5c5',
  wipeout5v5: 'Élimination 5c5',
  bigGame: 'Gros Gibier',
  bossFight: 'Combat de boss',
  roboRumble: 'Robo-Rumble',
  lastStand: 'Dernier rempart',
  payload: 'Convoi',
  hunters: 'Chasseurs',
  trophyEscape: 'Course aux trophées',
  unknown: 'Inconnu',
};

export function modeLabel(mode) {
  if (!mode) return 'Inconnu';
  return MODE_LABELS[mode] ?? mode.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

const MODE_EMOJI = {
  gemGrab: '💎',
  brawlBall: '⚽',
  bounty: '⭐',
  heist: '💰',
  hotZone: '🔥',
  knockout: '🥊',
  soloShowdown: '💀',
  duoShowdown: '👥',
  trioShowdown: '👨‍👩‍👦',
  duels: '⚔️',
  wipeout: '☠️',
};

export const modeEmoji = (mode) => MODE_EMOJI[mode] ?? '🎮';

/** Palier de trophees -> emoji, pour rendre les listes lisibles d'un coup d'oeil. */
export function rankEmoji(rank) {
  if (rank >= 35) return '🏆';
  if (rank >= 30) return '🥇';
  if (rank >= 25) return '🥈';
  if (rank >= 20) return '🥉';
  return '▫️';
}
