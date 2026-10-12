# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Particuliers (maison ou appartement) et petits professionnels (commerces, restaurants, bureaux, conciergeries, locations saisonnières) autour de Salon-de-Provence (Bouches-du-Rhône, 13). Ils veulent faire poser, entretenir ou réparer une climatisation réversible, souvent à l'approche de l'été ou quand une clim tombe en panne. Ils comparent les prix, cherchent un artisan fiable et joignable, et veulent savoir combien ça coûte avant d'appeler.

## Product Purpose

Site vitrine d'un artisan climaticien. Il doit transformer une visite en appel ou en demande de devis : afficher les prix, aider à choisir la bonne clim (puissance, type, gamme) et rassurer avec des chantiers réels et des avis Google.

## Positioning

Le prix d'abord : les prix de pose sont affichés publiquement (dès 1 290 € posé), ce que peu de concurrents locaux font. L'artisan pose lui-même, sans sous-traitance, et reste le même interlocuteur du premier appel à la mise en service.

## Operating Context

Parcours type : recherche Google locale (« climatisation Salon-de-Provence »), arrivée sur l'accueil ou une page ville, lecture des prix, éventuellement calcul de puissance ou simulateur, puis appel direct ou devis en ligne. Beaucoup de visites sur téléphone. Visite sur place, devis détaillé sous 24h, pose en général en une journée pour un monosplit.

## Capabilities and Constraints

- Site statique HTML/CSS/JS hébergé sur GitHub Pages (domaine thermaz.fr), sans étape de compilation.
- Devis rapide en étapes sur l'accueil (installation, entretien, dépannage) avec estimation en direct ; devis complet en 5 étapes (devis.html). Envoi par Web3Forms.
- Outils : calcul de puissance, convertisseur BTU ↔ kW, simulateur de prix (page installation).
- Avis Google mis à jour automatiquement chaque nuit (data/avis-google.json, robot GitHub).
- Pages villes (Salon, Pélissanne, Lançon, Miramas, Istres, Aix), blog conseils, FAQ, llms.txt, IndexNow.
- Moteur commun : assets/site.js (ne pas casser ses sélecteurs). Feuille commune : assets/site.css.

## Brand Commitments

- Nom « thermaz » en minuscules, logo flocon (assets/logo-flocon.svg).
- Dualité froid (bleu) / chaud (rouge) de la clim réversible : confirmée comme identité à garder par le client.
- Direction visuelle choisie par le client : « classique soigné », les codes habituels du métier exécutés avec une finition haut de gamme (repères : pages produits Apple, sites Daikin et Mitsubishi Electric). Techno demandée : GSAP et Three.js, effets de défilement.
- Voix : l'artisan parle à la première personne (« je pose », « je vous rappelle »), ton direct, simple, sans jargon commercial.

## Evidence on Hand

- Prix TTC pose standard comprise : murale 2,5 kW dès 1 290 € (essentielle) / 1 590 € (premium) ; 3,5 kW dès 1 450 € / 1 790 € ; 5 kW dès 2 050 € / 2 490 € ; bisplit dès 2 390 € / 3 090 € ; nettoyage 159 € par unité ; contrat d'entretien 149 €/an.
- Engagements : devis gratuit sous 24h, garantie pose 2 ans (prolongée avec le contrat), sans sous-traitance, lundi-samedi 8h-19h.
- Photos de chantiers réels dans photos/ (Mitsubishi Electric, Daikin, Bosch, Panasonic, Thermor, Altech) et une vidéo d'entretien (videos/).
- Marques installées : Mitsubishi Electric, Daikin, Atlantic, Thermor, Bosch, Panasonic, Altech, Toshiba.
- Contact : 06 51 10 64 35, thermaz.fr@gmail.com.
- Absences : aucun chiffre de clients, d'années d'expérience ou de certification n'est confirmé ; ne pas en inventer. Les témoignages viennent uniquement des avis Google réels.

## Product Principles

1. Le prix et l'action (appeler, demander un devis) restent visibles et immédiats.
2. Les chantiers réels sont la preuve : on montre, on ne promet pas.
3. Un seul interlocuteur, l'artisan : le site parle avec sa voix.
4. Rapide sur téléphone, même avec les effets.

## Accessibility & Inclusion

Public large, souvent âgé ou pressé : textes lisibles, contrastes forts, cibles tactiles confortables, contenu visible sans animation (respect de « réduire les animations »).
