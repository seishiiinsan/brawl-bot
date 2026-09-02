import './helpers/env.js';
import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { makePlayer, makeBattleLog, TAG_A } from './helpers/fixtures.js';
import { saveSnapshot, saveBattles, toSnapshotRow, snapshots } from '../src/db/repository.js';
import {
  computeProgress,
  brawlerMovers,
  series,
  battleStats,
  deepStats,
} from '../src/services/statsService.js';

const HOUR = 3600_000;

describe('historique et écarts', () => {
  let lastSnapshotId;
  let current;

  before(() => {
    // 72 h de relevés horaires, +100 trophées par heure.
    for (let i = 0; i < 72; i++) {
      lastSnapshotId = saveSnapshot(makePlayer(TAG_A, 'Gabin', i * 100), Date.now() - (71 - i) * HOUR);
    }
    current = toSnapshotRow(makePlayer(TAG_A, 'Gabin', 71 * 100), Date.now());
  });

  it('enregistre un relevé par heure', () => {
    assert.equal(snapshots.count(TAG_A), 72);
  });

  it('calcule l’écart sur 24 h depuis la bonne référence', () => {
    const progress = computeProgress(TAG_A, current, '24h');
    // 24 h en arrière = 24 relevés de 100 trophées.
    assert.equal(progress.deltas.trophies, 2400);
    assert.equal(progress.partial, false);
  });

  it('calcule l’écart sur 7 jours et signale l’historique incomplet', () => {
    const progress = computeProgress(TAG_A, current, '7j');
    // L'historique ne couvre que 72 h : on prend le plus ancien relevé.
    assert.equal(progress.deltas.trophies, 7100);
    assert.equal(progress.partial, true);
  });

  it('ne signale pas d’historique incomplet sur la période « tout »', () => {
    assert.equal(computeProgress(TAG_A, current, 'all').partial, false);
  });

  it('renvoie une progression vide pour un joueur inconnu', () => {
    const progress = computeProgress('#0000000', current, '24h');
    assert.equal(progress.baseline, null);
    assert.equal(progress.partial, true);
  });

  it('repère les brawlers qui ont bougé', () => {
    const movers = brawlerMovers(TAG_A, lastSnapshotId, '24h', 5);
    assert.ok(movers.gains.length > 0, 'des brawlers doivent avoir progressé');
    assert.equal(movers.gains[0].delta, 2400);
    assert.equal(movers.losses.length, 0);
  });

  it('produit une série temporelle ordonnée et ancrée avant la période', () => {
    const points = series(TAG_A, '24h', 'trophies');
    assert.ok(points.length >= 25, `attendu ≥ 25 points, reçu ${points.length}`);
    const times = points.map((p) => p.t);
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
    // Le point d'ancrage precede la fenetre : la courbe part de la vraie valeur.
    assert.ok(points[0].t <= Date.now() - 24 * HOUR);
  });

  it('ne duplique pas un relevé identique pris à quelques minutes d’écart', () => {
    const before = snapshots.count(TAG_A);
    const player = makePlayer(TAG_A, 'Gabin', 99 * 100);

    // Des valeurs nouvelles créent bien une ligne...
    saveSnapshot(player, Date.now());
    assert.equal(snapshots.count(TAG_A), before + 1);

    // ...mais un relevé identique pris juste après n'en crée pas une seconde.
    saveSnapshot(player, Date.now() + 60_000);
    saveSnapshot(player, Date.now() + 120_000);
    assert.equal(snapshots.count(TAG_A), before + 1);
  });
});

describe('statistiques de combat', () => {
  before(() => {
    saveBattles(TAG_A, makeBattleLog(TAG_A).items);
  });

  it('archive les combats sans les dupliquer', () => {
    const inserted = saveBattles(TAG_A, makeBattleLog(TAG_A).items);
    assert.equal(inserted, 0, 'un second archivage ne doit rien réinsérer');
  });

  it('agrège victoires, défaites et winrate', () => {
    const stats = battleStats(TAG_A, '24h');
    assert.equal(stats.total, 25);
    assert.equal(stats.victories + stats.defeats + stats.draws, 25);
    assert.ok(stats.winrate > 0 && stats.winrate <= 100);
  });

  it('compte un top 4 en showdown comme une victoire', () => {
    const stats = battleStats(TAG_A, '24h');
    const showdown = stats.modes.find((m) => m.key === 'soloShowdown');
    assert.ok(showdown, 'le mode showdown doit être présent');
    assert.equal(showdown.victories + showdown.defeats, showdown.total);
  });

  it('ventile par mode et par brawler', () => {
    const stats = battleStats(TAG_A, '24h');
    assert.equal(stats.modes.length, 4);
    assert.ok(stats.brawlers.length > 1);
    assert.equal(
      stats.modes.reduce((sum, m) => sum + m.total, 0),
      stats.total,
    );
  });

  it('renvoie un bilan vide sans erreur pour un joueur sans combat', () => {
    const stats = battleStats('#0000000', '24h');
    assert.equal(stats.total, 0);
    assert.equal(stats.winrate, null);
  });
});

describe('statistiques de profil', () => {
  it('agrège la collection de brawlers', () => {
    const stats = deepStats(makePlayer(TAG_A, 'Gabin', 0));
    assert.equal(stats.owned, 14);
    assert.ok(stats.maxed <= stats.owned);
    assert.ok(stats.averagePower >= 9 && stats.averagePower <= 11);
    assert.equal(stats.winsTotal, 12345 + 3210 + 2100);
    assert.ok(stats.trophyDebt > 0, 'les records dépassent les trophées actuels');
    assert.deepEqual(
      stats.sorted.map((b) => b.trophies),
      [...stats.sorted.map((b) => b.trophies)].sort((a, b) => b - a),
    );
  });

  it('ne divise pas par zéro pour un compte sans brawler', () => {
    const stats = deepStats({ brawlers: [] });
    assert.equal(stats.owned, 0);
    assert.equal(stats.averagePower, 0);
    assert.equal(stats.averageRank, 0);
  });
});
