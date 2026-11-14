# TODO — Libreca

## Grandes lignes

1. **Capture** : flux vidéo, détection de page, capture automatique.
2. **Traitement sans IA** : redressement, découpage gauche/droite, courbure, nettoyage (OpenCV).
3. **Assemblage** : ordre des pages, PDF uniforme, OCR optionnel.
4. **IA optionnelle** : effacement des doigts, hors ligne, version légère.
5. **Distribution** : PWA, puis Tauri (PC) et Capacitor (Android).
6. **Interface** : identité « Papier & Lumière » (système de design « Libreca — Système de design », maquette « LibreCa — Direction artistique & maquette »), accessible WCAG 2.2 AA.

## Décisions prises

- Licence : MPL-2.0 (libre et permissive)
- Interface : HTML, CSS et JavaScript natifs (modules ES, sans framework ni build)
- Langue de l'interface : français pour l'instant ; prévoir dès le début un choix de langue dans les paramètres (textes via clés de traduction) pour ajouter d'autres langues
- Format d'export : PDF uniquement pour l'instant
- Identité visuelle « Papier & Lumière » : thème Papier (clair) partout, thème Nuit (sombre) pour la capture et le mode sombre ; une seule action en couleur (accent « signet ») par écran
- Accessibilité : WCAG 2.2 niveau AA sur tous les écrans, et PDF produit accessible
- Icônes : jeu maison en SVG, sans dépendance

## Décisions à prendre

- [ ] Polices Fraunces (titres) et Inter (interface), licence SIL OFL 1.1, servies en local en WOFF2 sous-ensemblé (environ 100 Ko par fichier) : valider l'ajout

## Prochaines étapes

### v0.0 — Mise en place
- [x] Initialiser le dépôt Git (.gitignore) — licence MPL-2.0 ajoutée
- [x] Créer la structure du projet (index.html, src/, serveur local)
- [x] Mettre en place le système de traduction (clés, dictionnaire FR) et le choix de langue dans les paramètres
- [x] Intégrer OpenCV.js et vérifier qu'il charge — version 5.0.0, chargée dans un Web Worker
- [x] Tester l'accès caméra (localhost / HTTPS) sur PC et Android — page de test prête ; reste à tester sur les appareils

### v0.1 — Prototype (sans IA)
- [x] Choix de la source vidéo (liste des caméras) — choix mémorisé dans les paramètres
- [x] Afficher le flux et surligner la page détectée (contours + plus grand quadrilatère) — Canny, repli sur seuillage Otsu, dans le Web Worker
- [x] Bouton de capture manuelle
- [x] Redressement de perspective
- [x] Ajustement manuel des coins en secours — souris, tactile et flèches du clavier
- [x] Export PDF simple — petit générateur maison (JPEG intégrés tels quels), sans dépendance ; pdf-lib reste possible plus tard (OCR, métadonnées)
- [ ] Tester sur de vraies photos de livres (à ajouter dans tests/fixtures/) et sur téléphone Android
- [x] Détection de page robuste aux doigts posés sur la page (points de contour sur la peau ignorés, côtés ajustés par des droites, coin caché retrouvé)

### v0.1.5 — Système de design et écrans
- [ ] `src/styles/tokens.css` : variables CSS reprises de `tokens.json` (couleurs des thèmes Papier et Nuit, typographie, espacements, rayons, tailles, ombre `shadow-page`), tailles en `rem`
- [ ] Thèmes : Papier par défaut, Nuit sur l'écran de capture et avec `prefers-color-scheme: dark` ; choix du thème dans les paramètres (système / clair / sombre)
- [ ] Remplacer les couleurs et `color-mix()` en dur de `main.css` par les tokens (texte `ink` / `ink-muted`, bordures de contrôle `border-control`, liens `accent-text`)
- [ ] Polices Fraunces et Inter dans `src/vendor/fonts/` (`@font-face` local, piles de repli Georgia / system-ui), après validation
- [ ] Logo en SVG (livre ouvert dans les coins d'un viseur, mot-symbole **libre**ca, « ca » en accent) et icônes d'app (fond `ink` et fond `accent`), favicon
- [ ] Jeu d'icônes maison en SVG (`src/ui/icons/`), sans dépendance : trait 2px sur 24px, extrémités arrondies, `currentColor`, même dessin que le logo ; `aria-label` sur les boutons-icônes, `aria-hidden` sur les icônes décoratives ; aucun emoji
- [ ] Composant `Button` : variantes accent (une seule par écran), primary (fond `ink`), secondary (bordure), hauteur 52px, largeur libre, focus `focus` 2px décalé de 2px
- [ ] Composant `Shutter` (déclencheur 76px) : mode Auto (anneau `detect`) et Manuel (disque `accent`)
- [ ] Composant `StatusChip` (pastille 32px, icône + texte) : ok, info, warning, danger ; posée sur `scrim` au-dessus du flux caméra
- [ ] Composant `PageThumb` (vignette 64px, ratio 0,7, `radius-page`, `shadow-page`) : états en cours (`aria-current`) et à reprendre (tirets `warning`), nom accessible « Page 24, corrigée »
- [ ] Composant `Toggle` (`input type="checkbox" role="switch"` dans son `label`, ligne de 48px)
- [ ] Réorganiser `index.html` en écrans au lieu de cartes empilées : bibliothèque, capture, revue de page, livre et export, paramètres (la page de diagnostic passe dans les paramètres)
- [ ] Écran de capture plein écran en thème Nuit (maquette « 1 · Capture live ») : barre du haut (fermer, titre du livre, n° de page), viseur à coins verts, bande de vignettes, bas d'écran Auto / déclencheur / Terminer à portée du pouce
- [ ] Viseur : dessiner les coins de la page détectée (couleur `detect` + forme) plutôt qu'un contour, animation de resserrement à la détection
- [ ] Ajustement des coins (`corner-editor`) restylé avec les tokens
- [ ] Zones tactiles ≥ 48px (`target-min`), marges d'écran `space-5` (téléphone) / `space-8` (> 600px), portrait et paysage, interface utilisable à 200 % de taille de texte
- [ ] `prefers-reduced-motion` : animations remplacées par des fondus courts
- [ ] Microcopie : relire les clés de `fr.js` (vouvoiement, verbes d'action, pas de jargon technique) et prévoir 30 % de longueur en plus pour les autres langues
- [ ] Mention « Tout reste sur votre appareil » visible dans l'interface

### v0.2 — Capture automatique
- [ ] Mesure de stabilité (mouvement entre images)
- [ ] Mesure de netteté (variance du Laplacien)
- [ ] Détection de changement de page (empreinte d'image)
- [ ] Retour à chaque capture : vignette qui rétrécit vers la bande du bas (pas de flash blanc), vibration courte désactivable, signal sonore désactivable
- [ ] Annonces `aria-live="polite"` : « Page 24 capturée », « Doigt sur le texte — déplacez la main », image floue, lumière faible
- [ ] Bouton Auto / Manuel (Auto désactivé = déclenchement manuel, pas de temps limite) ; raccourci Espace dans l'écran de capture uniquement
- [ ] Pastilles d'état sur le flux : page / double page détectée, doigt repéré, image floue
- [ ] Détection de la reliure et découpage gauche/droite

### v0.3 — Qualité « livre numérique »
- [ ] Nettoyage : fond blanc, ombres, contraste, modes couleur / gris / N&B
- [ ] Recadrage et marges uniformes
- [ ] Correction de courbure simple (lignes de texte)
- [ ] Écran de revue de page (maquette « 2 · Revue de page ») : comparateur avant/après (`input type="range"` étiqueté, flèches du clavier), pastilles des corrections appliquées, boutons Reprendre / Valider
- [ ] Chaque correction nommée et annulable (pastille-bouton)
- [ ] Écran livre (maquette « 3 · Livre & export PDF ») : couverture, titre, nombre de pages, grille de vignettes
- [ ] Réordonner les pages par glisser-déposer ET boutons Monter / Descendre ; supprimer, reprendre une page
- [ ] Bibliothèque : liste des livres en cours, créer un livre, supprimer (action `danger` avec confirmation)
- [ ] Sauvegarde du projet en cours (IndexedDB)

### v0.4 — Doigts (IA optionnelle)
- [ ] Détection des mains (MediaPipe)
- [ ] Inpainting OpenCV (sans IA) en premier
- [ ] Module LaMa ONNX léger, téléchargeable à part
- [ ] Vérifier les licences des modèles
- [ ] Pastille « Doigt effacé » et visibilité dans le comparateur avant/après

### v0.5 — OCR et finitions
- [ ] OCR Tesseract.js en couche texte invisible (option « Texte sélectionnable » dans la feuille d'export)
- [ ] Métadonnées (titre, auteur), couverture
- [ ] PDF accessible : langue du document déclarée, titre dans les métadonnées, ordre de lecture correct
- [ ] Feuille d'export : bouton accent « Créer le PDF »
- [ ] PWA hors ligne (service worker), icônes d'app et manifeste aux couleurs du logo
- [ ] Audit d'accessibilité WCAG 2.2 AA (clavier, lecteur d'écran, contrastes dans les deux thèmes)

### v1.0 — Distribution
- [ ] Exécutable PC (Tauri)
- [ ] APK Android (Capacitor)
- [ ] Documentation utilisateur
