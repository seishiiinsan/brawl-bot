import { config } from '../config.js';
import { encodeTag } from '../utils/tag.js';

export class BrawlApiError extends Error {
  constructor(status, reason, message) {
    super(message || reason || `Erreur API (${status})`);
    this.name = 'BrawlApiError';
    this.status = status;
    this.reason = reason;
  }

  /** Message pretant a etre affiche dans Discord. */
  get userMessage() {
    switch (this.status) {
      case 404:
        return "Introuvable. Vérifie le tag (il se trouve sous ton pseudo dans le jeu, ex. `#2G0JR8VQ`).";
      case 403:
        return "Clé API refusée. Elle est probablement liée à une autre adresse IP — régénère-la sur developer.brawlstars.com avec l'IP du serveur.";
      case 429:
        return "Trop de requêtes envoyées à l'API Brawl Stars. Réessaie dans quelques secondes.";
      case 503:
        return "L'API Brawl Stars est en maintenance (souvent pendant les mises à jour du jeu).";
      default:
        return `L'API Brawl Stars a renvoyé une erreur (${this.status}). Réessaie plus tard.`;
    }
  }
}

/** Cache memoire tres court, pour eviter de spammer l'API sur les commandes repetees. */
class TtlCache {
  constructor() {
    this.map = new Map();
  }

  get(key) {
    const hit = this.map.get(key);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return hit.value;
  }

  set(key, value, ttlMs) {
    this.map.set(key, { value, expires: Date.now() + ttlMs });
    if (this.map.size > 500) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }
}

const cache = new TtlCache();

async function request(pathname, { ttl = 60_000, retries = 2 } = {}) {
  const cached = cache.get(pathname);
  if (cached) return cached;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let response;
    try {
      response = await fetch(`${config.brawl.baseUrl}${pathname}`, {
        headers: {
          Authorization: `Bearer ${config.brawl.apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      lastError = new BrawlApiError(0, 'network', `Impossible de joindre l'API : ${error.message}`);
      await sleep(250 * (attempt + 1));
      continue;
    }

    if (response.ok) {
      const data = await response.json();
      cache.set(pathname, data, ttl);
      return data;
    }

    let reason = null;
    let message = null;
    try {
      const body = await response.json();
      reason = body?.reason ?? null;
      message = body?.message ?? null;
    } catch {
      /* corps non JSON */
    }

    lastError = new BrawlApiError(response.status, reason, message);
    // Seuls 429 / 5xx valent une nouvelle tentative.
    if (response.status !== 429 && response.status < 500) throw lastError;
    await sleep(400 * (attempt + 1));
  }
  throw lastError;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const brawlApi = {
  /** Profil complet d'un joueur (inclut la liste de ses brawlers). */
  getPlayer: (tag) => request(`/players/${encodeTag(tag)}`, { ttl: 60_000 }),

  /** 25 derniers combats. L'API ne garde pas plus loin. */
  getBattleLog: (tag) => request(`/players/${encodeTag(tag)}/battlelog`, { ttl: 60_000 }),

  getClub: (tag) => request(`/clubs/${encodeTag(tag)}`, { ttl: 120_000 }),

  getClubMembers: (tag) => request(`/clubs/${encodeTag(tag)}/members`, { ttl: 120_000 }),

  /** Catalogue des brawlers (rarement modifie -> cache long). */
  getBrawlers: () => request('/brawlers', { ttl: 6 * 60 * 60 * 1000 }),

  getPlayerRankings: (country = 'global') =>
    request(`/rankings/${country}/players`, { ttl: 10 * 60 * 1000 }),
};
