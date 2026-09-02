import './helpers/env.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { renderLineChart, renderBarChart } from '../src/charts/renderer.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const isPng = (buffer) =>
  Buffer.isBuffer(buffer) && buffer.subarray(0, 4).equals(PNG_SIGNATURE) && buffer.length > 1000;

const points = (count, step = 100) =>
  Array.from({ length: count }, (_, i) => ({
    t: Date.now() - (count - 1 - i) * 3600_000,
    v: 40000 + i * step,
  }));

describe('courbes', () => {
  it('rend une courbe simple', () => {
    const png = renderLineChart({
      title: 'Gabin · Trophées',
      subtitle: '7 derniers jours',
      series: [{ label: 'Trophées', points: points(48) }],
    });
    assert.ok(isPng(png));
  });

  it('rend plusieurs séries superposées', () => {
    const png = renderLineChart({
      title: 'Comparaison',
      series: [
        { label: 'Gabin', points: points(48) },
        { label: 'Rival', points: points(48, 80) },
      ],
    });
    assert.ok(isPng(png));
  });

  it('affiche un message plutôt que planter quand il n’y a aucun point', () => {
    const png = renderLineChart({ title: 'Vide', series: [{ label: 'x', points: [] }] });
    assert.ok(isPng(png));
  });

  it('supporte une série parfaitement plate (division par zéro sur l’échelle)', () => {
    const flat = [
      { t: Date.now() - 3600_000, v: 500 },
      { t: Date.now(), v: 500 },
    ];
    assert.ok(isPng(renderLineChart({ title: 'Plat', series: [{ label: 'x', points: flat }] })));
  });

  it('supporte un point unique et des valeurs négatives', () => {
    assert.ok(
      isPng(renderLineChart({ title: 'Un point', series: [{ label: 'x', points: [{ t: Date.now(), v: 12 }] }] })),
    );
    const negatives = [
      { t: Date.now() - 3600_000, v: -50 },
      { t: Date.now(), v: 30 },
    ];
    assert.ok(isPng(renderLineChart({ title: 'Négatif', series: [{ label: 'x', points: negatives }] })));
  });
});

describe('barres', () => {
  it('rend un classement', () => {
    const png = renderBarChart({
      title: 'Top brawlers',
      subtitle: 'Classés par trophées',
      items: Array.from({ length: 12 }, (_, i) => ({
        label: `Brawler ${i}`,
        value: 1500 - i * 40,
        hint: `rang ${30 - i}`,
      })),
      footer: 'Total',
    });
    assert.ok(isPng(png));
  });

  it('supporte une seule barre et des valeurs nulles', () => {
    assert.ok(isPng(renderBarChart({ title: 'Une barre', items: [{ label: 'Shelly', value: 0 }] })));
  });

  it('accepte un format de valeur personnalisé', () => {
    const png = renderBarChart({
      title: 'Winrate',
      items: [{ label: 'Gemmes', value: 57 }],
      valueFormat: (v) => `${v} %`,
    });
    assert.ok(isPng(png));
  });
});
