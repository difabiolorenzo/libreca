# Libreca — consignes pour Claude

Application (PWA) qui numérise un livre papier avec une caméra et produit un PDF façon livre numérique. Projet personnel et open source (licence MPL-2.0), en français. Présentation : `README.md`. Tâches : `TODO.md`. Projet en phase de démarrage : pas encore de code.

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

## Architecture (prévue)

| Où | Quoi |
|---|---|
| `src/capture/` | Sources vidéo, détection de page en direct, déclencheur (stabilité, netteté, changement de page) |
| `src/pipeline/` | Une étape = un module, fonction pure image → image : redressement, découpage gauche/droite, courbure, nettoyage, recadrage |
| `src/ai/` | Modules IA optionnels (mains, effacement des doigts) |
| `src/export/` | Assemblage, OCR, PDF |
| `tests/fixtures/` | Photos de livres de référence et résultats attendus |

Mettre ce tableau à jour dès que la structure réelle existe.

## Dépendances et licences

- Licence du projet : MPL-2.0 (`LICENSE`). Toute dépendance doit être compatible (MIT, Apache-2.0, BSD, MPL…).
- Bibliothèques servies en local depuis `src/vendor/`, jamais depuis un CDN.
- Demander avant d'ajouter toute dépendance ou tout modèle d'IA.
- Vérifier sa licence (compatibilité avec la licence du projet) et noter la taille ajoutée.

## Commandes

À compléter quand le projet sera initialisé (installer, lancer, tester, construire).

## Façon de travailler

- Avant de commencer, regarder `TODO.md`. Une tâche terminée est cochée.
- Petite tâche claire : la faire directement. Tâche large ou ambiguë : proposer d'abord un plan court.
- Changements ciblés : ne pas reformater ni réorganiser du code sans rapport avec la demande.
- Chaque étape du traitement doit pouvoir être testée seule sur les photos de `tests/fixtures/`.
- Code, noms et commentaires en anglais. Interface en français pour l'instant, mais aucun texte en dur : tout passe par des clés de traduction (dictionnaire FR = référence), avec un choix de langue dans les paramètres pour ajouter d'autres langues plus tard.
- Export : PDF uniquement pour l'instant (pas d'EPUB).
- Terminer par : ce qui a changé, le résultat des tests, ce que l'utilisateur doit tester (PC et téléphone), et le message de commit proposé.
- Rédaction des fichiers Markdown : pas de retour à la ligne manuel au milieu d'une phrase ou d'un paragraphe ; un paragraphe ou un élément de liste tient sur une seule ligne.
