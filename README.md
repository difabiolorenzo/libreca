# Libreca

> Posez votre livre, Libreca s'occupe du reste.

**Libreca** transforme un livre papier en livre numérique (PDF) simplement en le posant devant une caméra. L'application détecte les pages en direct, les photographie automatiquement, les redresse, sépare les pages gauche et droite, les nettoie et assemble un PDF qui imite fidèlement un livre numérique.

*Libre* : comme le logiciel libre, et « livre » en espagnol. *Libreca* (libréka) : on y entend aussi « cam », pour caméra.

> ⚠️ Projet en phase de conception, pas encore utilisable.

## Fonctionnalités prévues

- 📷 **Sources vidéo multiples** : caméra de téléphone, webcam, carte de capture, fichier vidéo.
- 🤖 **Capture automatique** : la photo est prise dès que la page est stable et nette.
- 📐 **Redressement** de la perspective et correction de la courbure.
- ✂️ **Découpage** automatique des pages gauche et droite.
- 🧼 **Nettoyage** : fond blanc, suppression des ombres, contraste, couleur ou noir et blanc.
- ✋ **Effacement des doigts** par IA (module optionnel, fonctionne hors ligne).
- 🔎 **OCR** optionnel pour un PDF où l'on peut chercher du texte.
- 📚 **Export PDF** aux pages uniformes, façon livre numérique.

## Principes

- **100 % local et hors ligne** : vos livres ne quittent jamais votre appareil.
- **Multiplateforme** : Windows, Linux, macOS et Android.
- **Sans IA d'abord** : redressement, découpage et nettoyage reposent sur la vision par ordinateur classique (OpenCV). L'IA n'arrive qu'en module optionnel et léger.
- **Open source.**

## Architecture (prévue)

Une application web installable (PWA) qui fait tout le traitement dans le navigateur :

| Rôle | Technologie |
|---|---|
| Interface | HTML, CSS et JavaScript natifs (modules ES, sans build) |
| Vision classique | OpenCV.js (WebAssembly) |
| Détection des mains | MediaPipe Hand Landmarker |
| IA (effacement) | ONNX Runtime Web + LaMa (version légère) |
| OCR | Tesseract.js |
| PDF | pdf-lib |
| Stockage local | IndexedDB / OPFS |
| Paquets natifs | Tauri (PC), Capacitor (Android) |

## Démarrer

*À venir avec le premier prototype (v0.1).*

## Feuille de route

Voir [TODO.md](TODO.md).

## Contribuer

Les idées et retours sont les bienvenus via les issues.

## Licence

[Mozilla Public License 2.0](LICENSE) : libre et permissive. Les fichiers de Libreca modifiés et distribués doivent rester publics, mais Libreca peut être intégré dans d'autres projets.
