# TODO — Libreca

## Grandes lignes

1. **Capture** : flux vidéo, détection de page, capture automatique.
2. **Traitement sans IA** : redressement, découpage gauche/droite, courbure, nettoyage (OpenCV).
3. **Assemblage** : ordre des pages, PDF uniforme, OCR optionnel.
4. **IA optionnelle** : effacement des doigts, hors ligne, version légère.
5. **Distribution** : PWA, puis Tauri (PC) et Capacitor (Android).

## Décisions à prendre

- [x] Licence : MPL-2.0 (libre et permissive)
- [x] Interface : HTML, CSS et JavaScript natifs (modules ES, sans framework ni build)
- [x] Langue de l'interface : français pour l'instant ; prévoir dès le début un choix de langue dans les paramètres (textes via clés de traduction) pour ajouter d'autres langues
- [x] Format d'export : PDF uniquement pour l'instant

## Prochaines étapes

### v0.0 — Mise en place
- [ ] Initialiser le dépôt Git (.gitignore) — licence MPL-2.0 ajoutée
- [ ] Créer la structure du projet (index.html, src/, serveur local)
- [ ] Mettre en place le système de traduction (clés, dictionnaire FR) et le choix de langue dans les paramètres
- [ ] Intégrer OpenCV.js et vérifier qu'il charge
- [ ] Tester l'accès caméra (localhost / HTTPS) sur PC et Android

### v0.1 — Prototype (sans IA)
- [ ] Choix de la source vidéo (liste des caméras)
- [ ] Afficher le flux et surligner la page détectée (contours + plus grand quadrilatère)
- [ ] Bouton de capture manuelle
- [ ] Redressement de perspective
- [ ] Ajustement manuel des coins en secours
- [ ] Export PDF simple (pdf-lib)

### v0.2 — Capture automatique
- [ ] Mesure de stabilité (mouvement entre images)
- [ ] Mesure de netteté (variance du Laplacien)
- [ ] Détection de changement de page (empreinte d'image)
- [ ] Signal sonore + vignette à chaque capture
- [ ] Détection de la reliure et découpage gauche/droite

### v0.3 — Qualité « livre numérique »
- [ ] Nettoyage : fond blanc, ombres, contraste, modes couleur / gris / N&B
- [ ] Recadrage et marges uniformes
- [ ] Correction de courbure simple (lignes de texte)
- [ ] Écran de révision : réordonner, supprimer, reprendre une page
- [ ] Sauvegarde du projet en cours (IndexedDB)

### v0.4 — Doigts (IA optionnelle)
- [ ] Détection des mains (MediaPipe)
- [ ] Inpainting OpenCV (sans IA) en premier
- [ ] Module LaMa ONNX léger, téléchargeable à part
- [ ] Vérifier les licences des modèles

### v0.5 — OCR et finitions
- [ ] OCR Tesseract.js en couche texte invisible
- [ ] Métadonnées (titre, auteur), couverture
- [ ] PWA hors ligne (service worker)

### v1.0 — Distribution
- [ ] Exécutable PC (Tauri)
- [ ] APK Android (Capacitor)
- [ ] Documentation utilisateur
