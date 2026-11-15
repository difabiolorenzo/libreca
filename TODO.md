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
- Polices : Fraunces (titres) et Inter (interface), licence SIL OFL 1.1 (fichiers `OFL-Fraunces.txt` et `OFL-Inter.txt` joints), servies en local en WOFF2 sous-ensemblé (latin et latin étendu, graisses 400 à 700 : 87 Ko et 122 Ko)

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
- [x] Tester sur de vraies photos de livres (à ajouter dans tests/fixtures/) et sur téléphone Android
- [x] Détection de page robuste aux doigts posés sur la page (points de contour sur la peau ignorés, côtés ajustés par des droites, coin caché retrouvé)

### v0.1.5 — Système de design et écrans
- [x] `src/styles/tokens.css` : variables CSS reprises de `tokens.json` (couleurs des thèmes Papier et Nuit, typographie, espacements, rayons, tailles, ombre `shadow-page`), tailles en `rem`
- [x] Thèmes : Papier par défaut, Nuit sur l'écran de capture (classe `theme-nuit`) et avec `prefers-color-scheme: dark` ; choix du thème dans les paramètres (comme l'appareil / clair / sombre)
- [x] Remplacer les couleurs et `color-mix()` en dur de `main.css` par les tokens (texte `ink` / `ink-muted`, bordures de contrôle `border-control`, liens `accent-text`)
- [x] Polices Fraunces et Inter dans `src/vendor/fonts/` avec leur licence, mentionnées dans le README — `@font-face` local et piles de repli (`src/styles/fonts.css`)
- [x] Logo en SVG (livre ouvert dans les coins d'un viseur, mot-symbole **libre**ca, « ca » en accent) et icônes d'app (fond `ink` et fond `accent`), favicon — `src/assets/` ; icônes PNG de la PWA avec le manifeste (v0.4)
- [x] Jeu d'icônes maison en SVG (`src/ui/icons.js`, 20 icônes), sans dépendance : trait 2px sur 24px, extrémités arrondies, `currentColor`, même dessin que le logo ; `aria-label` sur les boutons-icônes, `aria-hidden` sur les icônes décoratives ; aucun emoji
- [x] Composant `Button` : variantes accent (une seule par écran), primary (fond `ink`), secondary (bordure), hauteur 52px, largeur libre, focus `focus` 2px décalé de 2px
- [x] Composant `Shutter` (déclencheur 76px) : mode Auto (anneau `detect`) et Manuel (disque `accent`) — mode Auto prêt côté style, utilisé avec la capture automatique (v0.2)
- [x] Composant `StatusChip` (pastille 32px, icône + texte) : ok, info, warning, danger ; posée sur `scrim` au-dessus du flux caméra
- [x] Composant `PageThumb` (vignette 64px, ratio 0,7, `radius-page`, `shadow-page`) : états en cours (`aria-current`) et à reprendre (tirets `warning`), nom accessible « Page 24, corrigée »
- [x] Composant `Toggle` (`input type="checkbox" role="switch"` dans son `label`, ligne de 48px) — prêt, servira aux réglages de capture (v0.2)
- [x] Réorganiser `index.html` en écrans au lieu de cartes empilées : bibliothèque, capture, revue de page, livre et export, paramètres (la page de diagnostic passe dans les paramètres) — navigation par adresse (`#/capture`, `#/book`, `#/page/3`, `#/settings`), bouton retour du navigateur et d'Android
- [x] Écran de capture plein écran en thème Nuit (maquette « 1 · Capture live ») : barre du haut (fermer, titre du livre, n° de page), viseur à coins verts, bande de vignettes, bas d'écran Auto / déclencheur / Terminer à portée du pouce — le bouton Auto arrive avec la capture automatique (v0.2)
- [x] Viseur : dessiner les coins de la page détectée (couleur `detect` + forme) plutôt qu'un contour, animation de resserrement à la détection
- [x] Ajustement des coins (`corner-editor`) restylé avec les tokens
- [x] Zones tactiles ≥ 48px (`target-min`), marges d'écran `space-5` (téléphone) / `space-8` (> 600px), portrait et paysage, interface utilisable à 200 % de taille de texte — capture en paysage : commandes en colonne à droite
- [x] `prefers-reduced-motion` : animations remplacées par des fondus courts (viseur, déclencheur, interrupteur)
- [x] Microcopie : relire les clés de `fr.js` (vouvoiement, verbes d'action, pas de jargon technique) et prévoir 30 % de longueur en plus pour les autres langues
- [x] Mention « Tout reste sur votre appareil » visible dans l'interface (écran d'accueil)

### v0.1.6 — Corrections mineures et amélioration
- [x] Capture : retourner l'image de la caméra (effet miroir)
- [x] Capture : rotation de 90° de la caméra (sens horaire et anti-horaire)
- [x] Capture : changer de source caméra directement depuis l'écran de capture
- [x] Revue de page : retourner (miroir) et faire pivoter la page
- [x] Livre : renommer le livre
- [x] Paramètres : en faire une fenêtre modale accessible depuis tous les écrans

### v0.2 — Capture automatique
- [x] Mesure de stabilité (mouvement entre images) — comparaison de luminance pixel par pixel (motion.js) et suivi temporel (stability.js)
- [x] Mesure de netteté (variance du Laplacien) — netteté globale ou restreinte à la page redressée (sharpness.js)
- [x] Détection de changement de page (empreinte d'image) — grille 16 × 24 de la page redressée, moyenne de chaque colonne retirée, distance par corrélation (fingerprint.js) ; capture automatique quand la page est trouvée, immobile, nette, sans doigt sur le texte et différente de la dernière capturée (auto-capture.js) ; seuils à calibrer sur de vraies photos
- [x] Retour à chaque capture : vignette qui rétrécit vers la bande du bas (pas de flash blanc), vibration courte désactivable, signal sonore désactivable — son synthétisé (Web Audio), sans fichier ; réglages dans Paramètres › Capture
- [x] Annonces `aria-live="polite"` : « Page 24 capturée », « Doigt sur le texte — déplacez la main », image floue, lumière faible — une seule zone d'annonce, sans répéter le même message
- [x] Bouton Auto / Manuel (Auto désactivé = déclenchement manuel, pas de temps limite) ; raccourci Espace dans l'écran de capture uniquement — choix mémorisé
- [x] Pastilles d'état sur le flux : page / double page détectée, doigt repéré, image floue — plus lumière faible ; une alerte apparaît après 3 images de suite, pour ne pas clignoter
- [x] Détection de la reliure et découpage gauche/droite — double page si plus large que haute, reliure = colonnes sans texte et ombre au milieu (binding.js), découpage en perspective exacte ; trait pointillé sur la reliure dans le viseur ; désactivable dans les paramètres

### v0.3 — Qualité « livre numérique »
- [x] Nettoyage : fond blanc, ombres, contraste, modes couleur / gris / N&B
- [x] Recadrage et marges uniformes
- [x] Correction de courbure simple (lignes de texte)
- [x] Écran de revue de page (maquette « 2 · Revue de page ») : comparateur avant/après (`input type="range"` étiqueté, flèches du clavier), pastilles des corrections appliquées, boutons Reprendre / Valider
- [x] Chaque correction nommée et annulable (pastille-bouton)
- [x] Écran livre (maquette « 3 · Livre & export PDF ») : couverture, titre, nombre de pages, grille de vignettes
- [x] Réordonner les pages par glisser-déposer ET boutons Monter / Descendre ; supprimer, reprendre une page
- [x] Bibliothèque : liste des livres en cours, créer un livre, supprimer (action `danger` avec confirmation)
- [x] Sauvegarde du projet en cours (IndexedDB)

### v0.4 — OCR et finitions
- [x] OCR Tesseract.js en couche texte invisible (option « Texte sélectionnable » dans la feuille d'export) — Tesseract.js 7 servi en local (`src/vendor/tesseract/`, moteur LSTM SIMD ou sans SIMD, modèle français), `src/export/ocr.js` ; texte invisible calé sur les mots de l'image, résultat gardé en mémoire tant que l'image de la page ne change pas
- [x] Métadonnées (titre, auteur), couverture — titre et auteur (champ « Auteur ou autrice » du panneau d'export, enregistré avec le livre) écrits dans le PDF (Info et XMP) ; couverture : photo choisie dans la revue de page (bouton « Couverture », placée en tête) ou, à défaut, couverture générée avec le titre et l'auteur (option du panneau d'export, `src/export/cover.js`) ; dans le PDF, la première page porte l'étiquette « Couverture » et la suivante est numérotée 1
- [x] PDF accessible : langue du document déclarée, titre dans les métadonnées, ordre de lecture correct — `/Lang`, `DisplayDocTitle` ; avec « Texte sélectionnable » : PDF balisé (paragraphes dans l'ordre de lecture, image de page en décoration, page sans texte en figure avec texte de remplacement)
- [ ] Feuille d'export : bouton accent « Créer le PDF »
- [x] PWA hors ligne (service worker), icônes d'app et manifeste aux couleurs du logo — service worker (`sw.js` : fichiers toujours à jour, copie hors ligne), `manifest.webmanifest` (installable, fond Papier), icônes PNG 192, 512, « maskable » 512 et Apple 180 dans `src/assets/`, produites depuis les SVG par `tools/icons.html`
- [x] Audit d'accessibilité WCAG 2.2 AA (clavier, lecteur d'écran, contrastes dans les deux thèmes) — analyse de tous les écrans et dialogues dans les deux thèmes (`tools/a11y-check.js` : contraste rendu, noms accessibles, cibles de 24 px, identifiants), clavier, largeur de 320 px ; corrigé : étiquettes « Avant / Après » illisibles en Nuit (1,0:1 → 8,9:1), boutons de la revue de page qui débordaient sur petit écran, placement des coins sans glisser (toucher un coin puis l'endroit, 2.5.7), position des coins annoncée, titre de l'onglet propre à chaque écran (2.4.2) ; reste à faire : essai avec un vrai lecteur d'écran (NVDA, TalkBack)

### v0.5 — Doigts (IA optionnelle)
- [ ] Détection des mains (MediaPipe)
- [ ] Inpainting OpenCV (sans IA) en premier
- [ ] Module LaMa ONNX léger, téléchargeable à part
- [ ] Vérifier les licences des modèles
- [ ] Pastille « Doigt effacé » et visibilité dans le comparateur avant/après

### v1.0 — Distribution
- [ ] Exécutable PC (Tauri)
- [ ] APK Android (Capacitor)
- [ ] Documentation utilisateur
