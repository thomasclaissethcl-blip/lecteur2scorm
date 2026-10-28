# SCORM Studio v6 : correction du chargement H5P multi-navigateurs

## Cause investiguée à partir du package fourni

L’archive `fantasy-map-2-181-1-scorm12(2).zip` contient effectivement les fichiers
`player/frame.bundle.js`, `player/styles/h5p.css` et les dépendances H5P. **Les
121 chemins virtuels relevés en erreur 404 dans le journal correspondent tous
à des fichiers présents dans le ZIP** (121/121). Le script H5PStandalone utilisé par ce package
construit une iframe interne `about:blank`, dont les requêtes peuvent échapper
au Service Worker selon les navigateurs. Le site GitHub Pages ne possédant pas
physiquement ces fichiers virtuels, le serveur répond 404, empêchant l’affichage H5P.

**Correction ciblée :** `sw-v6.js` restitue à la volée le bridge H5PStandalone
avec `embedType: "div"`, option déjà prise en charge par cette bibliothèque.
Les assets H5P sont alors chargés dans le document SCORM principal, contrôlé
par le Service Worker. Le ZIP original et les fichiers stockés dans le cache
ne sont pas modifiés. Les packages sans le bridge correspondant restent inchangés.
Le diagnostic du lecteur indique si le package a cette structure. Cette adaptation reste limitée aux packages utilisant ce bridge H5PStandalone ; les autres mécanismes de rendu ne sont pas modifiés.

**Portée de la validation :** la structure du ZIP et le code H5P ont été
inspectés, et des tests du Service Worker vérifient la transformation ciblée.
Les navigateurs automatisés de cet environnement bloquent l’accès aux serveurs
HTTP locaux ; nous ne pouvons donc pas certifier la disparition de l’écran
blanc sur l’installation GitHub Pages avant votre test.

**Mise à jour :** publier tous les fichiers à la racine du dépôt GitHub Pages,
notamment `sw-v6.js`, puis rouvrir le site (rechargement classique) et importer
le ZIP. Le stockage local des tentatives est conservé. Ne pas publier le ZIP de
test dans le dépôt.

---

# SCORM Studio v6 : diagnostic renforcé et interface corrigée

Application web **100 % statique**, conçue pour GitHub Pages. Aucun serveur applicatif, PHP, Node.js ou appel API Moodle n'est nécessaire pour utiliser le lecteur. Le SCORM ZIP est extrait **dans le navigateur**, puis servi par un Service Worker sur la même origine. Les tentatives et réglages sont conservés dans les espaces de stockage locaux de ce navigateur.

## Interface et correction de cycle de vie

- **Mode sombre** activé par défaut, thème clair disponible dans la barre supérieure, choix mémorisé localement. L’apparence du SCO reste définie par son éditeur : seul le lecteur est thémé.
- **Interface révisée** : espace de travail à trois panneaux, icônes SVG locales, contrôles à contraste élevé et présentation adaptée aux petits écrans.
- **Menus déroulants** : couleurs explicites pour les options normales et sélectionnées, compatibles avec les palettes sombres et claires.
- **Aides contextuelles** : boutons `?` à côté des métriques, réglages Moodle, tentatives et journaux ; survol, clic ou focus clavier ; fermeture avec Échap ou clic extérieur.
- **Transitions SCORM** : lors du rechargement, de la navigation entre SCO, de la fermeture, de la réinitialisation, du changement de tentative ou du chargement d’un autre package, l’API de l’ancien SCO reste disponible pendant `pagehide`/`unload` de l’iframe. La nouvelle session est créée **après** le déchargement. En cas de délai de déchargement dépassé, le journal avertit que cette fermeture ne peut pas être garantie.
- **Fermeture puis reprise** : `Fermer` retire le SCO de la page après réception de ses derniers appels API ; `Reprendre` le recharge dans **la même tentative**, avec le dernier état validé. `cmi.core.entry` (SCORM 1.2) ou `cmi.entry` (SCORM 2004) vaut `resume` lorsque la dernière sortie enregistrée était `suspend` ; sinon `ab-initio`.
- **Réinitialisation complète** : après confirmation, `Réinitialiser` ferme le contenu, efface **toutes les données CMI des SCO et toutes les tentatives** pour le package et l’apprenant actifs, remet le compteur à 1, vide le journal et relance le **premier SCO**. Les autres apprenants et packages restent inchangés ; les réglages Moodle et le thème sont conservés.
- **Erreurs 301** : leur description distingue maintenant la lecture avant `LMSInitialize` de l’accès après terminaison ; consultez le journal pour déterminer l’origine d’un appel refusé.

## Corrections et diagnostic Chrome de la v5

- **Bouton « Nouvelle fenêtre »** : la barre du lecteur possède désormais quatre zones de grille explicites (navigation, titre, diagnostic, nouvelle fenêtre). La disposition se replie sur deux lignes dans les espaces réduits. Le bouton ne déborde plus sous l’iframe. La position a été vérifiée dans Chromium sur six largeurs, de 390 à 1440 pixels.
- **Mise à jour du Service Worker** : la v6 utilise un nouveau fichier `sw-v6.js`. Lorsqu’un navigateur conserve l’ancien worker, l’application attend son remplacement ou recharge une seule fois la page. Le cache des packages et les progressions restent compatibles avec les versions antérieures. Le fichier `sw.js` reste inclus pour les pages mises en cache avec l’ancienne interface.
- **Diagnostic renforcé facultatif** : dans le panneau de diagnostic du contenu (icône bouclier), cliquez sur **« Diagnostic renforcé »**. Le SCO redémarre dans la même tentative et le Service Worker ajoute temporairement un petit capteur au HTML servi par le navigateur, avant les scripts du package. Ce capteur relève les erreurs JavaScript précoces, les promesses rejetées, les erreurs de ressources et des indicateurs de visibilité du contenu. Le ZIP original et les fichiers en cache restent inchangés. **« Relancer normalement »** désactive le capteur et redémarre le SCO.
- **Diagnostic d'affichage** : la copie du rapport inclut la taille de l’iframe, son état de visibilité, le statut de chargement du document, le nombre d’éléments HTML et les mesures remontées par le capteur. L’absence d’erreurs détectées n’équivaut pas à une preuve que le contenu est opérationnel.

### Procédure en cas de page blanche

1. Ouvrez Chrome, chargez votre ZIP et attendez l’apparition éventuelle du contenu.
2. Cliquez sur le bouclier du lecteur, puis **Diagnostic renforcé**. Cela ferme puis recharge le SCO dans la même tentative, sans effacer la progression conservée.
3. Si l’écran reste blanc, attendez quelques secondes, cliquez **Copier le diagnostic**, puis récupérez également les entrées du journal sous **Ressources / affichage**.
4. Pour distinguer un état SCORM sauvegardé incompatible d’un problème initial, choisissez un **nouvel identifiant d’apprenant de test** dans la colonne de gauche, puis **Appliquer**. Cela démarre avec un suivi distinct, sans effacer celui du premier apprenant.
5. Comparez le comportement avec Firefox normal. Transmettez les diagnostics des deux navigateurs ou le ZIP de test si vous pouvez le partager.

Historique v5 : le rapport montrait `LMSInitialize = true` et des données CMI relues, sans démontrer le rendu H5P. Le package fourni depuis a permis d’identifier les dépendances manquantes dans les requêtes réseau et l’iframe interne H5PStandalone comme cause probable du défaut multi-navigateurs. La v6 applique la correction ci-dessus.

**Attention :** le mode renforcé modifie temporairement la réponse HTML que voit le contenu pour effectuer l’instrumentation. Certains packages très sensibles à l’ordre des scripts peuvent réagir différemment sous instrumentation. Confirmez toujours le diagnostic en mode normal.

## Fonctionnalités principales

- **Moodle** (simulation du comportement de Moodle 4.5) : visualisation de l'état du SCO, du score brut, de la note calculée, des règles d'achèvement et des causes probables d'un blocage. Le panneau **Persistance et reprise** précise le statut sauvegardé, la position, la taille des données `suspend_data`, la prochaine valeur `entry` et les lectures observées après réouverture.
- **Données** : comparaison des valeurs CMI *en mémoire* et du dernier snapshot *validé localement* (`Commit` ou `Finish` / `Terminate`). Les cellules modifiables permettent d'injecter des données de test, identifiées comme telles dans le journal.
- **Journal** : suivi chronologique des appels API, du SCO, de la tentative, des arguments, des résultats, des codes d'erreur et d'une courte interprétation. Filtres par appels, écritures, cycle de vie, erreurs API ou problèmes de ressources. Export JSON avec snapshots et paramètres (jusqu'aux 5 000 derniers événements, conservés pendant la visite).
- **Tentatives** : création et consultation de plusieurs tentatives locales (maximum 100), notes des tentatives (meilleure, première, dernière achevée, moyenne) et notation des SCO (objets d'apprentissage, plus haute, moyenne, somme).
- **Conditions d'achèvement** : statuts `passed` / `completed`, tous les SCO, score brut minimal, existence d'une note, note de passage et consultation simulée.

Tous les calculs sont recalculés automatiquement pendant l'exécution du package. Une liste d'avertissements signale notamment les écritures non enregistrées et les limitations de SCORM 2004.

## Installation GitHub Pages

1. Placez **le contenu de ce dossier** à la racine de votre dépôt GitHub, avec `index.html`, `app.js`, `scorm-runtime.js`, `moodle-simulator.js`, `manifest.js`, `zip-reader.js`, `styles.css`, `sw-v6.js`, `sw.js` et `.nojekyll`.
2. Dans **Settings > Pages**, sélectionnez **Deploy from a branch** puis la branche de publication et le dossier **/(root)**, ou votre configuration GitHub Pages habituelle.
3. Ouvrez l'URL HTTPS fournie par GitHub Pages. Le Service Worker a besoin de HTTPS (ou de `localhost` pendant le développement) et doit être autorisé par le navigateur. Il peut être indisponible en navigation privée.
4. Glissez-déposez un fichier SCORM ZIP. Les fichiers ne sont pas téléversés vers GitHub ou Moodle.

Les chemins utilisés sont relatifs au site, y compris dans une URL de projet `https://compte.github.io/depot/`. Si un ancien Service Worker empêche le chargement, rechargez la page et, au besoin, supprimez les données du site dans le navigateur. Le Service Worker est déjà configuré pour prendre immédiatement le contrôle des nouveaux clients.

## Utilisation et interprétation

1. Ouvrez le package et commencez le SCO. En cas de page blanche, utilisez le bouton « Diagnostic du chargement » (bouclier) à côté de « Nouvelle fenêtre », puis consultez le journal filtré sur « Ressources / affichage ».
2. Dans **Moodle**, choisissez *Données en cours (projection)* pour voir l'évolution immédiate, y compris les modifications non validées. Choisissez *Données validées (Commit/Finish)* pour ne retenir que les valeurs persistées par l'émulateur.
3. Ouvrez **Journal** pour suivre les appels `LMSInitialize`, `LMSSetValue`, `LMSCommit`, `LMSFinish` (SCORM 1.2) ou leur équivalent SCORM 2004.
4. Reproduisez les réglages du véritable package Moodle dans **Paramètres Moodle simulés**. Ils sont enregistrés dans ce navigateur, sans lien avec un cours ou une activité Moodle existante.
5. Pour tester la reprise, avancez dans le contenu, cliquez sur **Fermer**, inspectez les données validées dans **Moodle**, puis cliquez sur **Reprendre**. Vérifiez dans le journal les valeurs relues et visuellement la position retrouvée.
6. Pour effacer le suivi, cliquez sur **Réinitialiser**, confirmez : tous les SCO et tentatives de l'apprenant actif repartent de zéro. Le package reste chargé, et l'outil ouvre sa première activité.
7. Vous pouvez créer des tentatives, comparer les états entre SCO et exporter le rapport JSON.

Attention : le simulateur affiche des **estimations**, et non les données effectivement reçues par un serveur Moodle. Le snapshot « validé » simule une politique d'enregistrement explicite lors de `Commit` / `Finish`. La stratégie exacte de sauvegarde de Moodle, les éventuels réglages d'administration, le déclenchement des tâches et l'état du carnet de notes peuvent différer. L'achèvement lié à la consultation est approximé par le lancement du package ici. Avant un changement de SCO ou un rechargement, le lecteur laisse l’ancien contenu exécuter ses handlers de sortie, qui peuvent transmettre de nouvelles valeurs et lancer un `Commit` ou un `Finish`. Les valeurs encore non validées après le déchargement ne sont pas reprises dans la session suivante.

**Référence du calcul** : branche officielle `MOODLE_405_STABLE` de Moodle :

- [`mod/scorm/locallib.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/scorm/locallib.php) : `scorm_grade_user_attempt`, `scorm_grade_user` ;
- [`mod/scorm/classes/completion/custom_completion.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/scorm/classes/completion/custom_completion.php) : `get_state` ;
- [`mod/scorm/lib.php`](https://github.com/moodle/moodle/blob/MOODLE_405_STABLE/mod/scorm/lib.php) : `scorm_grade_item_update`.

Quelques simplifications subsistent : la liste des SCO provient de l'organisation courante du manifeste, et non de la totalité des tables Moodle ; une tentative est considérée comme tracée lorsqu'une donnée a été enregistrée localement ; la note minimale et la note de passage correspondent aux contrôles simplifiés de la simulation ; les corrections éventuelles de note, activités et événements enregistrés dans Moodle ne sont pas disponibles ici. La prise en charge native de SCORM 2004 par Moodle 4.5 est partielle ; la prédiction pour ce standard est marquée **indicative**.

## Vie privée et sécurité

Le package reste sur l'appareil de l'utilisateur, stocké dans le Cache Storage du navigateur. Les données CMI, réglages et tentatives sont dans `localStorage`. Les valeurs CMI, notamment identifiants d'apprenant et réponses, peuvent constituer des données personnelles : évitez les données réelles ou confidentielles. L'export JSON contient ces données si elles ont été utilisées.

**N'ouvrez que des packages ZIP de confiance.** Leur JavaScript s'exécute sur l'origine du lecteur et peut accéder aux API du navigateur auxquelles cette origine a droit, y compris son stockage local. GitHub Pages n'isole pas les contenus SCORM non fiables. Le cache du navigateur ne constitue pas un stockage sécurisé et peut être vidé.

L’action « Réinitialiser » efface le suivi stocké **par le lecteur**, et non tous les éléments de stockage accessibles au site. Certains packages peuvent sauvegarder leurs propres données hors de l’API SCORM (autres clés `localStorage`, cookies, IndexedDB). Ces données autonomes, le cache des fichiers du ZIP et les préférences du lecteur ne sont pas supprimés ; pour purger entièrement l’origine, utilisez les réglages « données du site » du navigateur, après avoir exporté ce qui doit être conservé. Cette purge totale affecterait tous les apprenants et packages de cette origine.

Les contenus faisant des requêtes externes peuvent néanmoins contacter leurs propres domaines. L'application n'effectue aucun envoi automatique du ZIP vers un serveur.

## Limitations du lecteur

- ZIP64 et archives chiffrées non pris en charge ; décompression Deflate via `DecompressionStream('deflate-raw')` selon le navigateur.
- Modèle CMI courant de SCORM 1.2 et 2004, mais validation stricte non exhaustive ; navigation/sequencing SCORM 2004 non complète.
- Les SCO chargés depuis un autre domaine ne peuvent généralement pas lire l'API SCORM via la politique de même origine.
- Contenus historiques nécessitant Flash non pris en charge.
- Journal conservé uniquement en mémoire pendant la visite, et effacé lors d’une réinitialisation complète (exporter avant si besoin).
- Un rechargement de la page nécessite de réimporter le même ZIP ; le suivi validé dans `localStorage` est alors retrouvé (dans le même navigateur, tant qu'il n'a pas été supprimé).
- Les lectures de données par le package sont observables dans le journal ; elles ne garantissent pas à elles seules une restauration visuelle correcte, qui doit être constatée manuellement.
- Le lecteur n'est pas connecté à Moodle, ne modifie pas ses notes et ne reproduit pas les extensions locales de Moodle.
- Le diagnostic ne garantit pas de résoudre une incompatibilité H5P, WebGL ou une politique restrictive propre au navigateur. Le chargement d'un véritable ZIP sur le site GitHub Pages doit encore être testé dans les navigateurs concernés.

## Tests

Tests unitaires sans dépendances externes :

```bash
node --test tests/*.test.js
```

Les tests supplémentaires `tests/virtual-files.test.js` et `tests/virtual-files-v5.test.js` vérifie les ressources manquantes et les réponses HTTP partielles. Deux scénarios Chromium autonomes valident le cycle de vie et le panneau diagnostic sans serveur HTTP. Un package de test simple peut être créé avec `python tests/create-fixture.py`. Le script `tests/browser_smoke.py` décrit un parcours d'intégration Playwright facultatif. Les tests ne sont pas nécessaires pour le déploiement statique.

### Vérifications des versions précédentes (historique)

- 28 tests Node.js réussis en v5 ; 33 tests réussis en v6 (moteur SCORM, simulation Moodle, cycle de vie et fichier virtuel).
- Six formats d’écran validés via Chromium avec une page HTML locale mise en mémoire (vérification de la position du bouton « Nouvelle fenêtre »).
- L’exécution du scénario complet avec un ZIP dans Chromium a été tentée, mais l’environnement de test a refusé l’accès au serveur local (`ERR_BLOCKED_BY_ADMINISTRATOR`). Elle doit être reproduite sur GitHub Pages.
