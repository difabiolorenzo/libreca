# Libreca — consignes pour Claude

Application (PWA) qui numérise un livre papier avec une caméra et produit un PDF façon livre numérique. Projet personnel et open source (licence MPL-2.0), en français. Présentation : `README.md`. Tâches : `TODO.md`. Projet en phase de démarrage (v0.1 : prototype sans IA — détection de page en direct, capture manuelle, redressement, ajustement des coins, export PDF).

## Git : interdiction de commiter

**Ne jamais lancer `git commit`, `git push`, `git merge`, `git rebase`, `git reset`, `git revert`, `git tag` ni `git stash`**, même si cela paraît utile ou si un outil le suggère. L'utilisateur gère lui-même ses commits.

- Autorisé : `git status`, `git diff`, `git log`, `git show` (lecture seule).
- Le dépôt est sous Windows (fins de ligne CRLF) : depuis Linux, utiliser `git diff --ignore-cr-at-eol` pour voir les vrais changements.

## Contraintes absolues

1. **100 % local et hors ligne** : aucun appel réseau à l'exécution, aucun CDN, aucune police ou bibliothèque chargée depuis internet. Tout est servi en local.
2. **Confidentialité** : aucune image ni donnée utilisateur ne quitte l'appareil.
3. **Multiplateforme** : Windows, Linux, macOS et Android, à partir d'un seul code source.
4. **OpenCV d'abord** : chaque traitement (détection, redressement, découpage, courbure, nettoyage) a une version sans IA. L'IA reste un module optionnel, léger et téléchargeable à part, jamais une dépendance obligatoire.
5. **Fluidité sur téléphone** : ne jamais bloquer le flux caméra ; calculs lourds dans un Web Worker ; viser un téléphone Android modeste.

## Pile technique (prévue)

- HTML, CSS et JavaScript natifs : modules ES (`import`/`export`), **aucun framework, aucun build, aucun npm à l'exécution**. Types documentés en JSDoc. Pas de TypeScript.
- OpenCV.js (vision classique), MediaPipe Hand Landmarker (mains), ONNX Runtime Web (IA, ex. LaMa léger), Tesseract.js (OCR), pdf-lib (PDF), IndexedDB / OPFS (stockage).
- Paquets natifs plus tard : Tauri (PC), Capacitor (Android).
- La caméra exige HTTPS ou `localhost` : à prévoir pour les tests sur téléphone via le réseau local.

## Architecture

| Où | Quoi |
|---|---|
| `index.html` | Page unique de l'application |
| `sw.js` | Service worker : chaque fichier revérifié auprès du serveur à chaque chargement (page et Web Worker toujours de la même version, malgré le cache de 10 min de GitHub Pages), copie gardée pour le hors-ligne |
| `.htaccess` | Cache désactivé quand l'appli est servie par Apache (WAMP) |
| `src/main.js` | Point d'entrée : écrans (bibliothèque, capture, livre, revue de page), livre ouvert et sa sauvegarde, fenêtre des paramètres et vérifications, caméra (rotation, miroir, choix de source), capture, pages (orientation), titre du livre, export |
| `src/i18n/` | Traduction : `i18n.js` (`t()`, `data-i18n`, `data-i18n-attr`), `locales/fr.js` (référence), `locales/index.js` (langues disponibles) |
| `src/lib/` | Utilitaires : `settings.js` (localStorage), `theme.js` (thème Papier / Nuit, attribut `data-theme`), `store.js` (sauvegarde des livres et des pages dans IndexedDB), `image.js` (image de la vidéo, JPEG, réorientation), `orientation.js` (rotation par quart de tour et miroir), `opencv.js` + `opencv-worker.js` (OpenCV.js dans un Web Worker module, requêtes `detect` / `warp` / `process` / `enhance`), `opencv-ready.js` (attente du module, partagée avec les tests) |
| `src/styles/` | CSS : `tokens.css` (variables du système de design, thèmes Papier et Nuit, classe `theme-nuit`), `fonts.css` (polices locales), `components.css` (Button, Shutter, StatusChip, PageThumb, Toggle), `main.css` (mise en page) ; n'utiliser que les tokens |
| `src/assets/` | Logo et icônes d'app en SVG |
| `src/vendor/` | Bibliothèques tierces servies en local (`opencv/opencv.js`, non fourni dans le dépôt pour l'instant ; `fonts/` : Fraunces et Inter en WOFF2 sous-ensemblé, avec leur licence OFL) |
| `src/capture/` | Sources vidéo (`camera.js`), détection de page en direct sur le flux (`live-detector.js`), suivi de stabilité (`stability.js`), décision de capture automatique (`auto-capture.js`), retour à chaque capture : vignette, vibration, son (`feedback.js`) |
| `src/pipeline/` | Une étape = un module, fonction pure `(cv, image, …)` : `geometry.js` (quadrilatères, ajustement de droites, sans OpenCV), `skin.js` (détection de peau pour ignorer les doigts), `detect-page.js`, `perspective.js`, `sharpness.js` (variance du Laplacien), `motion.js` (mouvement d'image et quadrilatère), `fingerprint.js` (empreinte de page, changement de page), `fingers.js` (doigt sur le texte), `binding.js` (double page et reliure ; découpage avec `splitQuad` de `geometry.js`), `dewarp.js` (courbure des lignes de texte), `clean.js` (fond blanc, ombres, contraste, modes couleur / gris / N&B), `crop.js` (recadrage, marges uniformes), `enhance.js` (enchaîne les corrections, chacune désactivable) |
| `src/ai/` | (prévu) Modules IA optionnels (mains, effacement des doigts) |
| `src/export/` | `pdf.js` (générateur PDF minimal, une image JPEG par page) ; à venir : OCR |
| `src/ui/` | Composants d'interface : `screens.js` (écrans et navigation par adresse `#/…`), `icons.js` (jeu d'icônes maison, `data-icon`), `status-chip.js` (pastille d'état), `page-thumb.js` (vignette de page), `page-list.js` (pages du livre ouvert, sans affichage : image redressée, corrections, image finale ; signale chaque changement pour la sauvegarde), `reorder.js` (glisser-déposer à la souris ou au doigt), `corner-editor.js` (ajustement manuel des coins), `announcer.js` (annonces `aria-live` pour les lecteurs d'écran) |
| `tools/serve.mjs` | Serveur de développement sans dépendance (HTTP local, HTTPS sur le réseau local) |
| `tests/` | Tests `node:test` ; `tests/helpers/` (OpenCV.js dans Node, images de synthèse) ; `tests/fixtures/` : photos de livres de référence et résultats attendus |

Mettre ce tableau à jour quand la structure change.

## Dépendances et licences

- Licence du projet : MPL-2.0 (`LICENSE`). Toute dépendance doit être compatible (MIT, Apache-2.0, BSD, MPL…).
- Bibliothèques servies en local depuis `src/vendor/`, jamais depuis un CDN.
- Demander avant d'ajouter toute dépendance ou tout modèle d'IA.
- Vérifier sa licence (compatibilité avec la licence du projet) et noter la taille ajoutée.

## Commandes

Aucune installation : Node.js sert uniquement au serveur de développement et aux tests (`package.json` sans dépendance).

- Lancer : `npm start` → http://localhost:8080/
- Lancer sur le réseau local en HTTPS (téléphone) : `npm run start:lan` (certificat dans `.cert/`, voir `README.md`)
- Tester : `npm test` (`node --test`)
- Construire : rien à construire (pas de build).

## Façon de travailler

- Avant de commencer, regarder `TODO.md`. Une tâche terminée est cochée.
- Petite tâche claire : la faire directement. Tâche large ou ambiguë : proposer d'abord un plan court.
- Changements ciblés : ne pas reformater ni réorganiser du code sans rapport avec la demande.
- Chaque étape du traitement doit pouvoir être testée seule sur les photos de `tests/fixtures/`.
- Code, noms et commentaires en anglais. Interface en français pour l'instant, mais aucun texte en dur : tout passe par des clés de traduction (dictionnaire FR = référence), avec un choix de langue dans les paramètres pour ajouter d'autres langues plus tard.
- Export : PDF uniquement pour l'instant (pas d'EPUB).
- Terminer par : ce qui a changé, le résultat des tests, ce que l'utilisateur doit tester (PC et téléphone), et le message de commit proposé.
- Rédaction des fichiers Markdown : pas de retour à la ligne manuel au milieu d'une phrase ou d'un paragraphe ; un paragraphe ou un élément de liste tient sur une seule ligne.
