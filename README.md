# SCORM Studio : lecteur SCORM et simulateur Moodle 4.5

Application web **100 % statique**, conçue pour GitHub Pages. Aucun serveur applicatif, PHP, Node.js ou appel API Moodle n'est nécessaire pour utiliser le lecteur. Le SCORM ZIP est extrait **dans le navigateur**, puis servi par un Service Worker sur la même origine. Les tentatives et réglages sont conservés dans les espaces de stockage locaux de ce navigateur.

## Interface et correction de cycle de vie

- **Mode sombre** activé par défaut, thème clair disponible dans la barre supérieure, choix mémorisé localement. L’apparence du SCO reste définie par son éditeur : seul le lecteur est thémé.
- **Interface révisée** : espace de travail à trois panneaux, icônes SVG locales, contrôles à contraste élevé et présentation adaptée aux petits écrans.
- **Menus déroulants** : couleurs explicites pour les options normales et sélectionnées, compatibles avec les palettes sombres et claires.
- **Aides contextuelles** : boutons `?` à côté des métriques, réglages Moodle, tentatives et journaux ; survol, clic ou focus clavier ; fermeture avec Échap ou clic extérieur.
- **Transitions SCORM** : lors du rechargement, de la navigation entre SCO, de la réinitialisation, du changement de tentative ou du chargement d’un autre package, l’API de l’ancien SCO reste disponible pendant `pagehide`/`unload` de l’iframe. La nouvelle session est créée **après** le déchargement. Une réinitialisation efface les données locales **après** les derniers appels de fermeture du SCO. En cas de délai de déchargement dépassé, le journal avertit que cette fermeture ne peut pas être garantie.
- **Erreurs 301** : leur description distingue maintenant la lecture avant `LMSInitialize` de l’accès après terminaison ; consultez le journal pour déterminer l’origine d’un appel refusé.

## Fonctionnalités principales

- **Moodle** (simulation du comportement de Moodle 4.5) : visualisation de l'état du SCO, du score brut, de la note calculée, des règles d'achèvement et des causes probables d'un blocage.
- **Données** : comparaison des valeurs CMI *en mémoire* et du dernier snapshot *validé localement* (`Commit` ou `Finish` / `Terminate`). Les cellules modifiables permettent d'injecter des données de test, identifiées comme telles dans le journal.
- **Journal** : suivi chronologique des appels API, du SCO, de la tentative, des arguments, des résultats, des codes d'erreur et d'une courte interprétation. Filtres par appels, écritures, cycle de vie ou erreurs. Export JSON avec snapshots et paramètres (jusqu'aux 5 000 derniers événements, conservés pendant la visite).
- **Tentatives** : création et consultation de plusieurs tentatives locales (maximum 100), notes des tentatives (meilleure, première, dernière achevée, moyenne) et notation des SCO (objets d'apprentissage, plus haute, moyenne, somme).
- **Conditions d'achèvement** : statuts `passed` / `completed`, tous les SCO, score brut minimal, existence d'une note, note de passage et consultation simulée.

Tous les calculs sont recalculés automatiquement pendant l'exécution du package. Une liste d'avertissements signale notamment les écritures non enregistrées et les limitations de SCORM 2004.

## Installation GitHub Pages

1. Placez **le contenu de ce dossier** à la racine de votre dépôt GitHub, avec `index.html`, `app.js`, `scorm-runtime.js`, `moodle-simulator.js`, `manifest.js`, `zip-reader.js`, `styles.css`, `sw.js` et `.nojekyll`.
2. Dans **Settings > Pages**, sélectionnez **Deploy from a branch** puis la branche de publication et le dossier **/(root)**, ou votre configuration GitHub Pages habituelle.
3. Ouvrez l'URL HTTPS fournie par GitHub Pages. Le Service Worker a besoin de HTTPS (ou de `localhost` pendant le développement).
4. Glissez-déposez un fichier SCORM ZIP. Les fichiers ne sont pas téléversés vers GitHub ou Moodle.

Les chemins utilisés sont relatifs au site, y compris dans une URL de projet `https://compte.github.io/depot/`. Si un ancien Service Worker empêche le chargement, rechargez la page et, au besoin, supprimez les données du site dans le navigateur. Le Service Worker est déjà configuré pour prendre immédiatement le contrôle des nouveaux clients.

## Utilisation et interprétation

1. Ouvrez le package et commencez le SCO.
2. Dans **Moodle**, choisissez *Données en cours (projection)* pour voir l'évolution immédiate, y compris les modifications non validées. Choisissez *Données validées (Commit/Finish)* pour ne retenir que les valeurs persistées par l'émulateur.
3. Ouvrez **Journal** pour suivre les appels `LMSInitialize`, `LMSSetValue`, `LMSCommit`, `LMSFinish` (SCORM 1.2) ou leur équivalent SCORM 2004.
4. Reproduisez les réglages du véritable package Moodle dans **Paramètres Moodle simulés**. Ils sont enregistrés dans ce navigateur, sans lien avec un cours ou une activité Moodle existante.
5. Vous pouvez créer des tentatives, comparer les états entre SCO et exporter le rapport JSON.

Attention : le simulateur affiche des **estimations**, et non les données effectivement reçues par un serveur Moodle. Le snapshot « validé » simule une politique d'enregistrement explicite lors de `Commit` / `Finish`. La stratégie exacte de sauvegarde de Moodle, les éventuels réglages d'administration, le déclenchement des tâches et l'état du carnet de notes peuvent différer. L'achèvement lié à la consultation est approximé par le lancement du package ici. Avant un changement de SCO ou un rechargement, le lecteur laisse l’ancien contenu exécuter ses handlers de sortie, qui peuvent transmettre de nouvelles valeurs et lancer un `Commit` ou un `Finish`. Les valeurs encore non validées après le déchargement ne sont pas reprises dans la session suivante.

**Référence du calcul** : branche officielle `MOODLE_405_STABLE` de Moodle :

- [`mod/scorm/locallib.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/scorm/locallib.php) : `scorm_grade_user_attempt`, `scorm_grade_user` ;
- [`mod/scorm/classes/completion/custom_completion.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/scorm/classes/completion/custom_completion.php) : `get_state` ;
- [`mod/scorm/lib.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/scorm/lib.php) : `scorm_grade_item_update`.

Quelques simplifications subsistent : la liste des SCO provient de l'organisation courante du manifeste, et non de la totalité des tables Moodle ; une tentative est considérée comme tracée lorsqu'une donnée a été enregistrée localement ; la note minimale et la note de passage correspondent aux contrôles simplifiés de la simulation ; les corrections éventuelles de note, activités et événements enregistrés dans Moodle ne sont pas disponibles ici. La prise en charge native de SCORM 2004 par Moodle 4.5 est partielle ; la prédiction pour ce standard est marquée **indicative**.

## Vie privée et sécurité

Le package reste sur l'appareil de l'utilisateur, stocké dans le Cache Storage du navigateur. Les données CMI, réglages et tentatives sont dans `localStorage`. Les valeurs CMI, notamment identifiants d'apprenant et réponses, peuvent constituer des données personnelles : évitez les données réelles ou confidentielles. L'export JSON contient ces données si elles ont été utilisées.

**N'ouvrez que des packages ZIP de confiance.** Leur JavaScript s'exécute sur l'origine du lecteur et peut accéder aux API du navigateur auxquelles cette origine a droit, y compris son stockage local. GitHub Pages n'isole pas les contenus SCORM non fiables. Le cache du navigateur ne constitue pas un stockage sécurisé et peut être vidé.

Les contenus faisant des requêtes externes peuvent néanmoins contacter leurs propres domaines. L'application n'effectue aucun envoi automatique du ZIP vers un serveur.

## Limitations du lecteur

- ZIP64 et archives chiffrées non pris en charge ; décompression Deflate via `DecompressionStream('deflate-raw')` selon le navigateur.
- Modèle CMI courant de SCORM 1.2 et 2004, mais validation stricte non exhaustive ; navigation/sequencing SCORM 2004 non complète.
- Les SCO chargés depuis un autre domaine ne peuvent généralement pas lire l'API SCORM via la politique de même origine.
- Contenus historiques nécessitant Flash non pris en charge.
- Journal conservé uniquement en mémoire pendant la visite (exporter avant fermeture de l'onglet).
- Le lecteur n'est pas connecté à Moodle, ne modifie pas ses notes et ne reproduit pas les extensions locales de Moodle.

## Tests

Tests unitaires sans dépendances externes :

```bash
node --test tests/*.test.js
```

Un package de test simple peut être créé avec `python tests/create-fixture.py`. Le script `tests/browser_smoke.py` décrit un parcours d'intégration Playwright facultatif. Les tests ne sont pas nécessaires pour le déploiement statique.
