# Polices

Polices de l'interface, servies en local (aucun chargement réseau). Déclarées dans `src/styles/fonts.css`.

| Fichier | Police | Usage | Taille | Licence |
|---|---|---|---|---|
| `Fraunces-Variable.woff2` | Fraunces, variable, romain | Titres, noms de livres | 87 Ko | SIL OFL 1.1 (`OFL-Fraunces.txt`) |
| `InterVariable.woff2` | Inter 4, variable, romain | Interface | 122 Ko | SIL OFL 1.1 (`OFL-Inter.txt`) |

Les licences ne déclarent aucun « Reserved Font Name » : les noms de famille d'origine sont conservés.

## Fabrication

Fichiers d'origine : polices variables TTF de Google Fonts (Fraunces, Inter). Réduction avec fontTools (`pip install fonttools brotli`), outil de préparation uniquement, jamais utilisé par l'application :

```bash
python -m fontTools.varLib.instancer "Fraunces-VariableFont_SOFT,WONK,opsz,wght.ttf" SOFT=0 WONK=0 wght=400:700 -o fraunces.ttf
python -m fontTools.varLib.instancer "Inter-VariableFont_opsz,wght.ttf" wght=400:700 -o inter.ttf
python -m fontTools.subset fraunces.ttf --unicodes="U+0000-00FF,U+0100-024F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1E00-1EFF,U+2000-206F,U+20AC,U+2122,U+2190-2193,U+2212,U+2215,U+FEFF,U+FFFD" --layout-features="*" --flavor=woff2 --output-file=Fraunces-Variable.woff2
```

Même commande `subset` pour `inter.ttf` → `InterVariable.woff2`. Axes conservés : graisse (400 à 700) et taille optique (`opsz`) ; italiques non inclus.

Si un fichier manque, l'interface utilise les polices de repli (Georgia, police système).
