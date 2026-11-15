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
| PDF | générateur maison (v0.1), pdf-lib envisagé |
| Stockage local | IndexedDB / OPFS |
| Paquets natifs | Tauri (PC), Capacitor (Android) |

## Démarrer

Prérequis : [Node.js](https://nodejs.org/) 20.12 ou plus récent (uniquement pour le serveur de développement : aucune dépendance npm à installer).

1. Lancer le serveur local : `npm start` (ou `node tools/serve.mjs`).
2. Ouvrir http://localhost:8080/ dans le navigateur.

### Tester sur un téléphone Android

La caméra n'est accessible qu'en HTTPS ou sur `localhost`. Deux possibilités :

- **Câble USB (le plus simple)** : activer le débogage USB, lancer `npm start` sur le PC, puis `adb reverse tcp:8080 tcp:8080`. Sur le téléphone, ouvrir http://localhost:8080/ dans Chrome.
- **Wi-Fi (HTTPS local)** : créer un certificat auto-signé une seule fois, puis lancer `npm run start:lan` et ouvrir l'adresse `https://192.168.x.x:8080/` affichée. Le navigateur affiche un avertissement : choisir « Paramètres avancés », puis « Continuer ».

```sh
mkdir .cert
openssl req -x509 -newkey rsa:2048 -nodes -days 365 -keyout .cert/key.pem -out .cert/cert.pem -subj "/CN=libreca-dev"
```

Sous Windows, `openssl` est fourni avec Git Bash ; y écrire `-subj "//CN=libreca-dev"` (deux barres obliques). Le dossier `.cert/` est ignoré par Git.

### Tests

`npm test` (ou `node --test`) : vérifie notamment que toutes les clés de traduction utilisées existent dans le dictionnaire français, la détection de page et le redressement (sur des images de synthèse, avec OpenCV.js chargé dans Node) et le générateur de PDF.

## Feuille de route

Voir [TODO.md](TODO.md).

## Contribuer

Les idées et retours sont les bienvenus via les issues.

## Licence

[Mozilla Public License 2.0](LICENSE) : libre et permissive. Les fichiers de Libreca modifiés et distribués doivent rester publics, mais Libreca peut être intégré dans d'autres projets.

Bibliothèques tierces incluses dans `src/vendor/`, chacune avec sa propre licence :

- [OpenCV.js](src/vendor/opencv/) 5.0.0 : Apache-2.0.
- [Polices](src/vendor/fonts/) Fraunces et Inter (sous-ensembles WOFF2) : SIL OFL 1.1.
