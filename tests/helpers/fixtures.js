/** Jeux de donnees imitant les reponses de l'API Brawl Stars. */

export const TAG_A = '#2G0JR8VQ';
export const TAG_B = '#9LQPY0VC';
export const TAG_CLUB = '#2PP0YCV';

export const BRAWLER_NAMES = [
  'Shelly', 'Colt', 'Bull', 'Poco', 'Spike', 'Leon', 'Crow',
  'Piper', 'Mortis', 'Gene', 'Sandy', 'Amber', 'Bibi', 'Nita',
];

const MODES = ['gemGrab', 'brawlBall', 'soloShowdown', 'knockout'];

/** `seed` fait varier les valeurs : utile pour fabriquer un historique. */
export function makePlayer(tag = TAG_A, name = 'Gabin', seed = 0) {
  return {
    tag,
    name,
    nameColor: '#f0f',
    icon: { id: 28000000 },
    trophies: 40000 + seed,
    highestTrophies: 41000 + seed,
    expLevel: 250,
    expPoints: 900000 + seed * 10,
    '3vs3Victories': 12345 + seed,
    soloVictories: 3210,
    duoVictories: 2100,
    club: { tag: TAG_CLUB, name: 'Les Bleus' },
    brawlers: BRAWLER_NAMES.map((brawlerName, i) => ({
      id: 16000000 + i,
      name: brawlerName,
      power: 9 + (i % 3),
      rank: 18 + ((i + seed) % 18),
      trophies: 800 + i * 50 + seed,
      highestTrophies: 900 + i * 50 + seed,
      gadgets: [{ id: 1, name: 'G' }],
      starPowers: [{ id: 1, name: 'S' }, { id: 2, name: 'S2' }],
      gears: [{ id: 1, name: 'E' }, { id: 2, name: 'E2' }],
    })),
  };
}

/** Format de date de l'API : 20240115T193000.000Z */
function apiTime(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '.000Z');
}

export function makeBattleLog(tag = TAG_A, count = 25) {
  return {
    items: Array.from({ length: count }, (_, i) => {
      const mode = MODES[i % MODES.length];
      const isShowdown = mode === 'soloShowdown';
      return {
        battleTime: apiTime(new Date(Date.now() - i * 1200_000)),
        event: { id: 15000000 + i, mode, map: `Carte ${i}` },
        battle: {
          mode,
          type: 'ranked',
          result: isShowdown ? undefined : i % 3 === 0 ? 'defeat' : 'victory',
          rank: isShowdown ? (i % 8) + 1 : undefined,
          trophyChange: i % 3 === 0 ? -6 : 8,
          starPlayer: { tag: i % 5 === 0 ? tag : '#OTHER' },
          teams: [
            [{ tag, brawler: { name: BRAWLER_NAMES[i % BRAWLER_NAMES.length] } }, { tag: '#A' }],
            [{ tag: '#B' }, { tag: '#C' }],
          ],
        },
      };
    }),
  };
}

export function makeClub() {
  return {
    tag: TAG_CLUB,
    name: 'Les Bleus',
    description: 'Club de test',
    type: 'inviteOnly',
    badgeId: 8000000,
    requiredTrophies: 40000,
    trophies: 900000,
    members: BRAWLER_NAMES.map((name, i) => ({
      tag: `#M${i}`,
      name,
      role: i === 0 ? 'president' : i < 3 ? 'vicePresident' : 'member',
      trophies: 70000 - i * 1500,
      icon: { id: 1 },
    })),
  };
}

/**
 * Remplace `fetch` par un faux serveur API. Renvoie une fonction de restauration
 * et le journal des URL appelees.
 */
export function stubFetch({ status = 200, reason = null } = {}) {
  const original = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url) => {
    const decoded = decodeURIComponent(String(url));
    calls.push(decoded);

    if (status !== 200) {
      return { ok: false, status, json: async () => ({ reason }) };
    }

    let body = {};
    if (decoded.includes('/battlelog')) {
      body = makeBattleLog(decoded.match(/players\/(#[^/]+)/)[1]);
    } else if (decoded.includes('/players/')) {
      const tag = decoded.match(/players\/(#[^/]+)/)[1];
      body = makePlayer(tag, tag === TAG_A ? 'Gabin' : 'Rival', tag === TAG_A ? 500 : 0);
    } else if (decoded.includes('/clubs/')) {
      body = makeClub();
    }
    return { ok: true, status: 200, json: async () => body };
  };

  return { calls, restore: () => { globalThis.fetch = original; } };
}
