# Brawl Bot

Bot Discord de statistiques **Brawl Stars** : profils détaillés, progression sur 24 h / 7 j / 30 j,
graphiques en image, analyse des combats, comparaison de joueurs et suivi automatique.

L'API officielle Brawl Stars ne renvoie qu'un **instantané** (plus les 25 derniers combats) : elle n'a
aucune notion d'historique. Le bot enregistre donc ses propres relevés dans une base SQLite locale —
à chaque commande, et automatiquement pour les joueurs suivis. C'est ce qui rend possibles les écarts
« dernières 24 h », « 7 derniers jours » et les courbes.

## Commandes

| Commande | Ce qu'elle affiche |
| --- | --- |
| `/profil` | Fiche complète : trophées, record, niveau, victoires 3c3/solo/duo, paliers de rangs, top 5 brawlers, progression 24 h et 7 j |
| `/stats` | Ce qui a bougé sur une période : trophées, victoires, XP, rangs, rythme par jour, brawlers qui ont progressé ou chuté, bilan des combats |
| `/graph` | Courbe d'évolution en image (trophées, record, victoires 3c3/solo/duo, XP, brawlers, somme des rangs) sur 24 h, 7 j, 30 j ou tout l'historique |
| `/brawlers` | Classement des brawlers + graphique en barres, triable par trophées, record, rang, puissance ou écart au record |
| `/combats` | Winrate global, par mode et par brawler, bilan de trophées, nombre de MVP, 5 derniers matchs |
| `/comparer` | Deux joueurs côte à côte, avec leurs deux courbes superposées |
| `/club` | Stats d'un club : trophées, type, membres, top 10 et répartition en graphique |
| `/lier` | Associe ton compte Discord à ton tag — ensuite toutes les commandes marchent sans rien préciser |
| `/suivi` | `ajouter` / `retirer` / `liste` : relevé automatique régulier, c'est ce qui remplit les graphiques |
| `/aide` | Mode d'emploi et état de la base |

Chaque commande accepte `tag:#2G0JR8VQ`, ou `membre:@pseudo` pour cibler quelqu'un du serveur qui a
fait `/lier`, ou rien du tout si tu as lié ton propre compte.

## Installation

### 1. Prérequis

- Node.js 20 ou plus
- Un bot Discord (https://discord.com/developers/applications) : onglet **Bot** → **Reset Token**
- Une clé API Brawl Stars (https://developer.brawlstars.com) : **My Account → Create New Key**

> ⚠️ La clé Brawl Stars est **liée à l'adresse IP** du serveur qui l'utilise. Récupère l'IP publique de
> ta machine (`curl ifconfig.me`) et mets-la lors de la création de la clé. Si ton IP change (box
> résidentielle), régénère la clé, ou passe par un proxy en renseignant `BRAWL_API_BASE`.

### 2. Configuration

```bash
git clone <ce-dépôt> && cd brawl-bot
npm install
cp .env.example .env   # puis remplis DISCORD_TOKEN, DISCORD_CLIENT_ID et BRAWL_API_KEY
```

`DISCORD_GUILD_ID` est facultatif : s'il est renseigné, les commandes sont déployées sur ce serveur
uniquement et sont disponibles **immédiatement** (le déploiement global met jusqu'à une heure à se
propager). Idéal pendant le développement.

### 3. Inviter le bot

Dans le portail développeur, onglet **OAuth2 → URL Generator**, coche `bot` et
`applications.commands`, puis ouvre l'URL générée. Le bot n'a besoin d'aucune permission particulière
au-delà d'écrire et joindre des fichiers — il ne lit aucun message (aucun intent privilégié requis).

### 4. Lancer

```bash
npm run deploy   # enregistre les commandes slash auprès de Discord (à refaire si tu en modifies une)
npm start        # démarre le bot
```

## Suivi automatique

`/suivi ajouter tag:#2G0JR8VQ` inscrit un joueur : le bot prend un relevé selon `SNAPSHOT_CRON`
(toutes les heures par défaut) même si personne ne tape de commande. C'est ce qui donne des courbes
denses et des écarts 24 h fiables.

Sans suivi, l'historique se construit quand même — mais uniquement aux moments où quelqu'un consulte
le profil.

Les données au-delà de `SNAPSHOT_RETENTION_DAYS` (120 jours par défaut) sont purgées chaque nuit.
Pour déclencher un relevé depuis un cron système plutôt que depuis le bot :

```bash
npm run snapshot
```

## Variables d'environnement

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `DISCORD_TOKEN` | Token du bot | — (obligatoire) |
| `DISCORD_CLIENT_ID` | Application ID | — (obligatoire) |
| `DISCORD_GUILD_ID` | Déploiement instantané sur un serveur de test | global |
| `BRAWL_API_KEY` | Clé API Brawl Stars | — (obligatoire) |
| `BRAWL_API_BASE` | URL de l'API (ou d'un proxy) | `https://api.brawlstars.com/v1` |
| `DATABASE_FILE` | Fichier SQLite | `data/brawl.db` |
| `SNAPSHOT_CRON` | Planification des relevés | `0 * * * *` |
| `SNAPSHOT_RETENTION_DAYS` | Rétention de l'historique | `120` |

## Architecture

```
src/
  index.js              client Discord, routage des interactions, gestion d'erreurs
  deploy-commands.js    enregistrement des commandes slash
  config.js             lecture et validation de l'environnement
  api/
    brawlstars.js       client HTTP : cache court, réessais, erreurs traduites
    assets.js           icônes Brawlify, libellés FR des modes de jeu
  db/
    database.js         schéma SQLite (relevés, brawlers, combats, liens, suivi)
    repository.js       requêtes préparées et transactions
  services/
    statsService.js     relevés, calcul des écarts, séries, stats de combat
    scheduler.js        relevés planifiés et purge
  charts/
    renderer.js         rendu PNG (courbes et barres) avec @napi-rs/canvas
  commands/             une commande slash par fichier
```

## Notes

- Les images de brawlers, d'icônes et de blasons viennent du CDN communautaire **Brawlify** :
  l'API officielle n'en fournit pas.
- En showdown, l'API renvoie un classement et non un résultat : le bot compte le **top 4** comme une
  victoire (convention habituelle de la communauté) dans les calculs de winrate.
- Ce projet n'est ni affilié ni approuvé par Supercell.
