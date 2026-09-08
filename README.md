# Lecteur SCORM

Lecteur SCORM 1.2 et SCORM 2004 entièrement exécuté dans le navigateur.

L'application ne nécessite aucun backend et aucune installation sur l'ordinateur de l'utilisateur. Le package ZIP sélectionné reste dans le navigateur : il n'est pas envoyé vers GitHub ni vers un autre serveur.

## Fonctionnement

1. L'utilisateur ouvre le lecteur depuis une page HTTPS, par exemple GitHub Pages.
2. Il sélectionne ou dépose un package SCORM au format ZIP.
3. Le navigateur lit `imsmanifest.xml`, décompresse les fichiers et les place dans un cache local géré par un Service Worker.
4. Le premier SCO est lancé dans le lecteur.
5. Les valeurs du modèle CMI sont conservées dans `localStorage`, séparément pour chaque package, SCO et apprenant simulé.

## Déploiement sur GitHub Pages

Le projet peut être publié directement comme site statique. Tous les chemins nécessaires au lecteur sont relatifs au répertoire de publication, ce qui permet un déploiement aussi bien à la racine d'un site GitHub Pages que dans un dépôt de projet de la forme :

```text
https://utilisateur.github.io/nom-du-depot/
```

Le fichier `.nojekyll` à la racine indique à GitHub Pages de servir le projet comme un site statique sans traitement Jekyll.

## Compatibilité

Pris en charge :

- ZIP standard avec entrées stockées ou Deflate ;
- SCORM 1.2 : API LMS principale et modèle CMI usuel ;
- SCORM 2004 : API principale, modèle CMI usuel et requêtes de navigation `continue`, `previous` et `choice` simples ;
- chemins relatifs dans les packages grâce au Service Worker ;
- ressources HTML, JavaScript, CSS, images, audio, vidéo, polices, PDF et autres fichiers servis avec un type MIME adapté ;
- persistance locale et reprise de session ;
- ouverture d'un SCO dans l'iframe du lecteur ou dans une nouvelle fenêtre.

Limites connues :

- ZIP64 et ZIP chiffrés non pris en charge ;
- le navigateur doit prendre en charge `DecompressionStream('deflate-raw')` pour les ZIP compressés en Deflate ;
- le moteur ne reproduit pas intégralement le Sequencing & Navigation de SCORM 2004 ;
- la validation stricte de tous les types et vocabulaires du modèle CMI n'est pas exhaustive ;
- un SCO pointant vers un domaine externe ne peut généralement pas accéder à l'API du lecteur à cause de la politique de même origine ;
- les technologies obsolètes non prises en charge par les navigateurs modernes, par exemple Flash, restent inutilisables.

## Fichiers de l'application

- `index.html` : interface ;
- `styles.css` : mise en forme ;
- `zip-reader.js` : lecteur ZIP ;
- `manifest.js` : analyse du manifeste IMS/SCORM ;
- `scorm-runtime.js` : émulation des API SCORM 1.2 et SCORM 2004 ;
- `app.js` : orchestration du lecteur ;
- `sw.js` : système de fichiers virtuel ;
- `.nojekyll` : désactivation du traitement Jekyll sur GitHub Pages.
