import './helpers/env.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeTag, encodeTag } from '../src/utils/tag.js';
import { num, delta, percent, humanSpan, parseBattleTime, bar } from '../src/utils/format.js';

describe('normalizeTag', () => {
  it('accepte un tag avec ou sans dièse, en minuscules', () => {
    assert.equal(normalizeTag('#2G0JR8VQ'), '#2G0JR8VQ');
    assert.equal(normalizeTag('2g0jr8vq'), '#2G0JR8VQ');
    assert.equal(normalizeTag('  #2g0jr8vq  '), '#2G0JR8VQ');
  });

  it('corrige la confusion O / 0, courante quand on recopie un tag', () => {
    assert.equal(normalizeTag('#2GOJR8VQ'), '#2G0JR8VQ');
  });

  it('rejette les caractères absents de l’alphabet Supercell', () => {
    // A, B, D, E... n'existent pas dans les tags Brawl Stars.
    assert.equal(normalizeTag('#ABC'), null);
    assert.equal(normalizeTag('#XYZ123'), null);
  });

  it('rejette les entrées vides, trop courtes ou trop longues', () => {
    assert.equal(normalizeTag(''), null);
    assert.equal(normalizeTag(null), null);
    assert.equal(normalizeTag('#29'), null);
    assert.equal(normalizeTag('#2222222222222222'), null);
  });

  it('encode le dièse pour l’URL de l’API', () => {
    assert.equal(encodeTag('#2G0JR8VQ'), '%232G0JR8VQ');
    assert.equal(encodeTag('2G0JR8VQ'), '%232G0JR8VQ');
  });
});

describe('formatage', () => {
  it('sépare les milliers à la française', () => {
    assert.match(num(1234567), /^1.234.567$/);
    assert.equal(num(null), '—');
  });

  it('affiche les écarts avec leur signe', () => {
    assert.equal(delta(0), '±0');
    assert.match(delta(1500), /^\+1.500$/);
    assert.match(delta(-42), /^−42$/);
    assert.equal(delta(2.5), '+2,5');
  });

  it('rend les durées lisibles', () => {
    assert.equal(humanSpan(30 * 60_000), '30 min');
    assert.equal(humanSpan(3 * 3600_000), '3 h');
    assert.equal(humanSpan(3.5 * 3600_000), '3 h 30 min');
    assert.equal(humanSpan(26 * 3600_000), '1 j 2 h');
    assert.equal(humanSpan(48 * 3600_000), '2 j');
  });

  it('interprète le format de date de l’API', () => {
    const date = parseBattleTime('20240115T193000.000Z');
    assert.equal(date.toISOString(), '2024-01-15T19:30:00.000Z');
    assert.equal(parseBattleTime(null), null);
  });

  it('trace une barre de progression bornée', () => {
    assert.equal(bar(0, 10), '░'.repeat(10));
    assert.equal(bar(1, 10), '█'.repeat(10));
    assert.equal(bar(0.5, 10), '█'.repeat(5) + '░'.repeat(5));
    // Un ratio hors bornes ne doit pas produire une barre difforme.
    assert.equal(bar(2, 10).length, 10);
    assert.equal(bar(-1, 10).length, 10);
  });

  it('formate les pourcentages', () => {
    assert.match(percent(57.25), /^57,3/);
  });
});
