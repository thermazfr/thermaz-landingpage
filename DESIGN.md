# Design Thermaz

Charte commune à tout le site (assets/site.css). La page d'accueil ajoute sa mise en page et ses mouvements dans assets/home.css et assets/home.js.

## Principe

Le standard du métier, exécuté proprement : photos de vrais chantiers et prix posés au premier plan, design en retrait. Seul ornement : la dualité froid (bleu) / chaud (rouge) de la clim réversible, en ligne fine bicolore.

## Couleurs (variables CSS)

| Rôle | Clair | Sombre |
|---|---|---|
| `--bg` fond | #FFFFFF | #081019 |
| `--alt` sections alternées | #F4F6F8 | #0C1621 |
| `--fg` texte | #0D1B2A | #EAF0F5 |
| `--muted` texte secondaire | #53647A | #9DAEBF |
| `--line` filets | #E2E7EC | #1F3244 |
| `--band` bandes sombres | #0B1622 | #050B11 |
| `--cold` liens, repères | #1565C8 | #5EA3EE |
| `--warm` action principale | #D3381F | #D3381F |

Le rouge est réservé à l'action principale (devis, appeler) et au prix mis en avant.

## Typographie

Archivo (Google Fonts, axes largeur 62-125 et graisse 400-800).
- Titres : graisse 750, largeur 86-92, interlettrage -0,03 à -0,04 em, interligne ~1.
- Chiffres (prix, puissances) : largeur 78-80, chiffres tabulaires.
- Texte : 17 px, interligne 1,55.

## Formes

Rayons 10 / 18 / 26 px, boutons en pilule. Ombres douces et décalées vers le bas. Pas de bordure colorée épaisse, pas de surtitre au-dessus des titres, pas d'icône en caractère Unicode.

## Mouvement

- Défilement fluide (Lenis) et animations au défilement (GSAP + ScrollTrigger), bibliothèques dans assets/vendor.
- Moment fort : section épinglée des puissances, la photo change avec une transition Three.js (chargé seulement à l'approche).
- Discret ailleurs : photos révélées, parallaxe interne, mots qui s'allument, ondulation au survol des chantiers.
- Tout le contenu reste visible sans JavaScript ; « réduire les animations » coupe le défilement fluide, l'épinglage et le WebGL.
