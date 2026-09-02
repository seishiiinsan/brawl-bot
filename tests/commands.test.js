import './helpers/env.js';
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { makePlayer, stubFetch, TAG_A, TAG_B, TAG_CLUB } from './helpers/fixtures.js';
import { commands, commandsJson } from '../src/commands/index.js';
import { saveSnapshot } from '../src/db/repository.js';
import { BrawlApiError } from '../src/api/brawlstars.js';
import { UserError } from '../src/utils/errors.js';

/** Fausse interaction Discord : enregistre ce que la commande aurait envoyé. */
function makeInteraction(commandName, options = {}, subcommand = null) {
  const payloads = [];
  return {
    payloads,
    commandName,
    user: { id: 'user-1', username: 'gabin' },
    guildId: 'guild-1',
    deferred: false,
    replied: false,
    isChatInputCommand: () => true,
    options: {
      getString: (key) => (key in options ? String(options[key]) : null),
      getInteger: (key) => (key in options ? Number(options[key]) : null),
      getBoolean: (key) => (key in options ? Boolean(options[key]) : null),
      getUser: (key) => options[key] ?? null,
      getSubcommand: () => subcommand,
    },
    async deferReply() { this.deferred = true; },
    async reply(payload) { this.replied = true; payloads.push(payload); },
    async editReply(payload) { payloads.push(payload); },
  };
}

/** Limites imposées par l'API Discord : les dépasser fait échouer l'envoi. */
function assertEmbedIsValid(embed) {
  const json = embed.toJSON ? embed.toJSON() : embed;
  assert.ok((json.title ?? '').length <= 256, 'titre ≤ 256 caractères');
  assert.ok((json.description ?? '').length <= 4096, 'description ≤ 4096 caractères');
  assert.ok((json.fields ?? []).length <= 25, 'au plus 25 champs');
  for (const field of json.fields ?? []) {
    assert.ok(field.name.trim().length > 0 && field.name.length <= 256, `nom de champ : ${field.name}`);
    assert.ok(field.value.trim().length > 0, `champ vide : ${field.name}`);
    assert.ok(field.value.length <= 1024, `champ trop long : ${field.name} (${field.value.length})`);
  }
  assert.ok((json.footer?.text ?? '').length <= 2048, 'pied de page ≤ 2048 caractères');
  assert.ok(JSON.stringify(json).length <= 6000, 'embed ≤ 6000 caractères au total');
  return json;
}

async function run(commandName, options, subcommand) {
  const interaction = makeInteraction(commandName, options, subcommand);
  await commands.get(commandName).execute(interaction);
  const payload = interaction.payloads.at(-1);
  assert.ok(payload, `/${commandName} n'a envoyé aucune réponse`);
  for (const embed of payload.embeds ?? []) assertEmbedIsValid(embed);
  return payload;
}

describe('définitions des commandes slash', () => {
  it('respecte les contraintes de l’API Discord', () => {
    assert.ok(commandsJson.length >= 10);
    for (const command of commandsJson) {
      assert.match(command.name, /^[\w-]{1,32}$/);
      assert.ok(command.description.length <= 100, `${command.name} : description trop longue`);
      for (const option of command.options ?? []) {
        assert.ok(option.description.length <= 100, `${command.name}.${option.name}`);
        assert.ok((option.choices ?? []).length <= 25);
      }
    }
  });

  it('n’a pas de nom de commande en double', () => {
    const names = commandsJson.map((c) => c.name);
    assert.equal(new Set(names).size, names.length);
  });
});

describe('exécution des commandes', () => {
  let stub;

  before(() => {
    stub = stubFetch();
    // 48 h de relevés pour que /stats et /graph aient de la matière.
    for (const tag of [TAG_A, TAG_B]) {
      for (let i = 0; i < 48; i++) {
        saveSnapshot(makePlayer(tag, 'Joueur', i * 60), Date.now() - (47 - i) * 3600_000);
      }
    }
  });

  after(() => stub.restore());

  it('/profil renvoie une fiche complète', async () => {
    const payload = await run('profil', { tag: TAG_A });
    const embed = payload.embeds[0].toJSON();
    assert.match(embed.title, /Gabin/);
    assert.ok(embed.fields.length >= 4);
  });

  it('/stats fonctionne sur chaque période', async () => {
    for (const periode of ['24h', '7j', '30j', 'all']) {
      const payload = await run('stats', { tag: TAG_A, periode });
      assert.ok(payload.embeds[0].toJSON().fields.length >= 3);
    }
  });

  it('/graph joint une image pour chaque métrique', async () => {
    for (const metrique of ['trophies', 'wins3v3', 'xp', 'ranks']) {
      const payload = await run('graph', { tag: TAG_A, periode: '24h', metrique });
      assert.equal(payload.files.length, 1);
    }
  });

  it('/brawlers accepte tous les tris', async () => {
    for (const tri of ['trophies', 'highest', 'rank', 'power', 'debt']) {
      const payload = await run('brawlers', { tag: TAG_A, tri, nombre: 10 });
      assert.equal(payload.files.length, 1);
    }
  });

  it('/combats analyse les combats archivés', async () => {
    const payload = await run('combats', { tag: TAG_A, periode: '24h' });
    assert.equal(payload.files.length, 1);
    assert.match(payload.embeds[0].toJSON().description, /winrate/);
  });

  it('/comparer superpose deux joueurs', async () => {
    const payload = await run('comparer', { joueur1: TAG_A, joueur2: TAG_B, periode: '7j' });
    assert.match(payload.embeds[0].toJSON().title, /vs/);
  });

  it('/club affiche un club et ses membres', async () => {
    const payload = await run('club', { tag: TAG_CLUB });
    assert.equal(payload.files.length, 1);
  });

  it('/lier puis les commandes sans tag utilisent le compte lié', async () => {
    await run('lier', { tag: TAG_A });
    const payload = await run('profil', {});
    assert.match(payload.embeds[0].toJSON().author.name, new RegExp(TAG_A));
  });

  it('/suivi ajoute, liste et retire un joueur', async () => {
    await run('suivi', { tag: TAG_B }, 'ajouter');
    const liste = await run('suivi', {}, 'liste');
    assert.match(liste.embeds[0].toJSON().description, new RegExp(TAG_B));
    const retrait = await run('suivi', { tag: TAG_B }, 'retirer');
    assert.match(retrait.content, /plus suivi/);
  });

  it('/aide décrit les commandes', async () => {
    const payload = await run('aide', {});
    assert.ok(payload.embeds[0].toJSON().fields.length >= 4);
  });
});

describe('gestion des erreurs', () => {
  it('refuse un tag invalide avec un message explicite', async () => {
    const stub = stubFetch();
    try {
      await assert.rejects(
        () => run('profil', { tag: '#INVALIDE!' }),
        (error) => error instanceof UserError && /tag valide/.test(error.message),
      );
    } finally {
      stub.restore();
    }
  });

  it('demande un tag quand aucun compte n’est lié', async () => {
    const interaction = makeInteraction('graph', {});
    interaction.user.id = 'user-sans-compte';
    await assert.rejects(
      () => commands.get('graph').execute(interaction),
      (error) => error instanceof UserError && /lier/.test(error.message),
    );
  });

  it('traduit une erreur 404 de l’API en message lisible', async () => {
    const stub = stubFetch({ status: 404, reason: 'notFound' });
    try {
      await assert.rejects(
        () => run('profil', { tag: '#2G0JR8V9' }),
        (error) => error instanceof BrawlApiError && /Vérifie le tag/.test(error.userMessage),
      );
    } finally {
      stub.restore();
    }
  });

  it('signale une clé API liée à une autre IP (403)', async () => {
    const stub = stubFetch({ status: 403, reason: 'accessDenied' });
    try {
      await assert.rejects(
        () => run('profil', { tag: '#2G0JR8V9' }),
        (error) => error instanceof BrawlApiError && /adresse IP/.test(error.userMessage),
      );
    } finally {
      stub.restore();
    }
  });

  it('explique l’absence d’historique plutôt que de tracer une courbe vide', async () => {
    const stub = stubFetch();
    try {
      await assert.rejects(
        () => run('graph', { tag: '#2G0JR8V9', periode: '24h' }),
        (error) => error instanceof UserError && /suivi/.test(error.message),
      );
    } finally {
      stub.restore();
    }
  });
});
