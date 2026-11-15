# Tesseract.js

Ce dossier contient Tesseract.js (reconnaissance de texte, licence Apache-2.0, compatible MPL-2.0) et le modèle de langue française. Tout est servi en local : aucun CDN. Par défaut, Tesseract.js va chercher son moteur et ses langues sur jsDelivr ; `src/export/ocr.js` lui donne toujours des chemins locaux (`workerPath`, `corePath`, `langPath`).

## Version installée

Fichiers tirés de trois paquets npm, intégrité des archives vérifiée (sha512 identique à celle publiée par le registre) :

| Fichier | Paquet | Taille (octets) | SHA-256 |
|---|---|---|---|
| `tesseract.esm.min.js` | `tesseract.js` 7.0.0 (`dist/`) | 63 220 | `64871d76c75609fd5413b88a8171e2ef40deedd77d5875ba23df104b2d05eb29` |
| `worker.min.js` | `tesseract.js` 7.0.0 (`dist/`) | 111 307 | `576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d` |
| `core/tesseract-core-simd-lstm.wasm.js` | `tesseract.js-core` 7.0.0 | 3 899 472 | `c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38` |
| `core/tesseract-core-lstm.wasm.js` | `tesseract.js-core` 7.0.0 | 3 896 484 | `eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680` |
| `lang/fra.traineddata.gz` | `@tesseract.js-data/fra` 1.0.0 (`4.0.0_best_int/`) | 707 406 | `d611139672b3752c7097e671e4a1d9209dfd37f2aeb081ef6487fba3351e9255` |

Moteur LSTM seul (le plus précis, sans le moteur « legacy »), en deux versions : avec SIMD (navigateurs récents) et sans SIMD (anciens appareils). `ocr.js` choisit selon le navigateur. La version « relaxed SIMD » du paquet n'est pas fournie : `ocr.js` passe toujours le chemin exact d'un des deux fichiers.

## Installation ou mise à jour

1. Télécharger les archives : `npm pack tesseract.js@7.0.0 tesseract.js-core@7.0.0 @tesseract.js-data/fra@1.0.0` (dans un dossier temporaire, hors du dépôt).
2. Copier les fichiers du tableau ci-dessus à leur place, avec les licences.
3. Garder la même version pour `tesseract.js` et `tesseract.js-core` (le premier attend le second en version 7).
4. Lancer `npm test`, puis exporter un PDF avec l'option « Texte sélectionnable » : le texte doit pouvoir être sélectionné et recherché.

Autre langue : ajouter `lang/<code>.traineddata.gz` depuis le paquet `@tesseract.js-data/<code>` (dossier `4.0.0_best_int/`).

## Taille

Environ 8,7 Mo en tout (WebAssembly intégré en base64 dans les fichiers `core/`). Rien n'est chargé tant que l'option « Texte sélectionnable » n'est pas utilisée ; un seul des deux moteurs est chargé.

## Licences

- Tesseract.js : Apache-2.0, [LICENSE-tesseract.js.md](LICENSE-tesseract.js.md). Source : https://github.com/naptha/tesseract.js
- Tesseract.js-core (Tesseract OCR compilé en WebAssembly) : Apache-2.0, [core/LICENSE](core/LICENSE). Source : https://github.com/naptha/tesseract.js-core
- Modèle français : données `tessdata_best` du projet Tesseract OCR, Apache-2.0 (même texte que ci-dessus), converties en entiers par Tesseract.js. Source : https://github.com/tesseract-ocr/tessdata_best
