# OpenCV.js

Ce dossier contient `opencv.js` (licence Apache-2.0, compatible MPL-2.0). Le fichier est servi en local : aucun CDN.

## Version installée

- OpenCV.js **5.0.0**, tiré du paquet npm `@techstark/opencv-js` 5.0.0-release.1 (fichier `package/dist/opencv.js`, intégrité de l'archive vérifiée).
- Taille : 13 298 869 octets (environ 13,3 Mo).
- SHA-256 : `b873c8211421da7b9bf41ae157a923f05a46a0b8d3e5904c44c6f3ad6d39a1bd`
- Différences avec le fichier officiel (d'après le correctif du paquet) : `globalThis` au lieu de `this` dans l'enveloppe UMD et `var Module = {}`, deux corrections de compatibilité sans effet sur les fonctions d'OpenCV.

## Installation ou mise à jour

1. Télécharger `opencv.js` version 5.0.0 : https://docs.opencv.org/5.0.0/opencv.js (lien officiel). Si ce lien ne répond pas, le même fichier se trouve dans le paquet npm `@techstark/opencv-js` : https://registry.npmjs.org/@techstark/opencv-js/-/opencv-js-5.0.0-release.1.tgz (archive à ouvrir, fichier `package/dist/opencv.js`).
2. L'enregistrer ici : `src/vendor/opencv/opencv.js`.
3. Lancer le serveur local et ouvrir l'application : la ligne « OpenCV.js » des vérifications doit indiquer « chargé (version 5.0.0) ».

Toujours fixer un numéro de version précis : l'adresse `4.x` redirige vers une ancienne version 4, pas vers la dernière.

## Taille

Environ 13 Mo (WebAssembly intégré en base64). Le fichier est chargé dans un Web Worker pour ne pas bloquer l'interface. Une version allégée (modules utiles seulement) pourra être compilée plus tard.

## Licence

Apache-2.0 : texte complet dans [LICENSE](LICENSE) (copie obligatoire lors de la redistribution). Source : https://github.com/opencv/opencv/blob/5.x/LICENSE
