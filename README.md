# Quizz Cartes

Quizz d'entraînement sur les cartes et règlements de DONNA et Mamie Fada.

- **Espace équipe** : entraînement (Facile, Complet, Allergènes, Vins), progression personnelle, consultation des cartes.
- **Espace manager** (protégé par un code) : progression de chaque équipier, points faibles de l'équipe, publication des cartes.

## Fonctionnement

La page est hébergée sur GitHub Pages et ne contient **aucune donnée** : ni carte, ni progression.
Chacun se connecte avec son compte Microsoft 365 du groupe ; les cartes et les progressions sont
stockées dans le site SharePoint du groupe (voir le tuto de configuration envoyé aux administrateurs).

Tant que `config.js` est vide, le quizz tourne en **mode démo** : tout reste dans le navigateur.

## Mise en service

1. Renseigner `clientId`, `tenantId` et `siteUrl` dans `config.js`.
2. Ouvrir l'espace manager une première fois avec un compte qui a les droits de modification sur le site :
   choisir le code manager, puis importer le fichier Excel des cartes.
3. Verrouiller la liste « Progressions » (chacun ne voit que sa ligne) comme décrit dans le tuto.

## Cartes et fichier Excel

Les cartes se mettent à jour depuis l'espace manager avec un fichier Excel au format figé
(onglets `Lisez-moi`, `Cartes`, `Plats`, `Boissons`, `Vins`, `Règlement`, `Allergènes`) :
télécharger la version en ligne, la modifier, la réimporter. Le fichier est vérifié avant publication.

Chaque plat appartient à une carte nommée (DONNA : Classique, Brunch ; Mamie Fada : Classique,
Braséro, Fondue). Les managers cochent les cartes en service ; les équipes peuvent réviser
toutes les cartes en service ou une seule. Boissons, vins et règlement sont communs à un restaurant.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html`, `styles.css` | Page et mise en forme |
| `engine.js` | Génération des questions, correction, calcul de progression |
| `store.js` | Stockage : mode démo (navigateur) ou Microsoft 365 (SharePoint via Microsoft Graph) |
| `app.js` | Interfaces équipe et manager |
| `excel.js` | Format Excel des cartes (lecture, vérification, écriture) |
| `vendor/exceljs.min.js` | Bibliothèque Excel (ExcelJS, licence MIT), chargée seulement dans l'espace manager |
| `config.js` | Identifiants Microsoft 365 (non secrets) |
| `vendor/msal-browser.min.js` | Bibliothèque de connexion Microsoft (MSAL, licence MIT) |

Les fichiers de cartes (`cartes*.json`, `*.xlsx`) ne doivent jamais être ajoutés à ce dépôt public.
