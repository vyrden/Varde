# 01 — Principes directeurs

Sept règles activables. Chacune sert d'arbitre quand une revue tranche
entre deux options qui semblent valides. Si une décision UI est en
contradiction avec un principe, le principe gagne sauf demande explicite
documentée dans `decisions.md`.

---

## 1. Une intention par écran

**Énoncé.** Chaque écran sert une intention primaire. Les intentions
secondaires existent mais ne se disputent pas la place du protagoniste.

**Justification.** L'admin ouvre le dashboard pour faire quelque chose
de précis : configurer un module, valider un setup, consulter un audit.
Si l'écran propose six accès équivalents, il a déjà perdu. La vitesse
d'exécution prime sur la complétude apparente.

**Règle opérationnelle.** Avant de poser un composant, répondre à : est-il
sur le chemin de l'intention primaire ou sur un chemin secondaire ?
Le primaire occupe la moitié supérieure du viewport et le poids
typographique le plus fort. Le secondaire vit en seconde lecture
(colonne latérale, accordéon, lien discret).

**Anti-pattern.** Une page d'accueil de serveur qui empile six cartes
de tailles identiques — modules, permissions, audit, paramètres,
documentation, statistiques — sans hiérarchie. Le visiteur scrolle,
hésite, perd dix secondes pour rien.

---

## 2. Densité contextuelle, pas densité moyenne

**Énoncé.** L'espacement s'adapte à la zone, pas à la page. Une liste
de modules respire ; un formulaire de configuration peut être dense ;
une section d'aide reste aérée. Pas de `padding` uniforme par défaut.

**Justification.** L'uniforme produit deux symptômes : zones sur-aérées
qui forcent au scroll inutile, ou zones sous-aérées qui rendent les
cibles d'action illisibles. Les deux dégradent la vitesse perçue.

**Règle opérationnelle.** Trois densités définies :
- *Aérée* : sections marketing, états vides, démarrage rapide.
- *Moyenne* : listes courtes, cartes de navigation, panneaux d'aperçu.
- *Dense* : tables, formulaires multi-champs, audit log paginé.

Chaque écran déclare sa densité dominante dans la fiche de
`03-screens-map.md`. Les exceptions locales sont nommées.

**Anti-pattern.** Mettre `gap-6` partout "par cohérence" et finir avec
une page de modules où dix entrées prennent trois écrans à scroller.

---

## 3. Justifier chaque élément à l'écran

**Énoncé.** Si on supprime un élément et que l'utilisateur n'en remarque
pas l'absence, il n'aurait pas dû être là.

**Justification.** Le bruit visuel ralentit la compréhension. Une carte
"vide" qui affiche "0 modules désactivés" est du bruit : elle prend la
place d'un élément utile sans porter d'information actionnable.

**Règle opérationnelle.** Pour chaque composant ajouté, écrire en une
phrase ce qu'il permet de faire ou de comprendre. Si la phrase commence
par "permettre de voir que" et finit sur une métrique non actionnable,
retirer le composant ou le déplacer dans une vue analytique séparée.

**Anti-pattern.** Bandeau "Statut : tout va bien" en permanence en haut
du dashboard. Information vraie 99 % du temps, donc invisible 99 % du
temps. À remplacer par un bandeau qui n'apparaît que quand quelque
chose ne va pas.

---

## 4. La typographie porte la hiérarchie

**Énoncé.** La hiérarchie de l'écran se lit d'abord par les contrastes
de taille, de poids et de graisse. La couleur reste un signal sémantique
(succès, danger, primaire) et un accent rare.

**Justification.** Empiler des nuances de gris pour différencier des
sections produit un écran fatigant et difficile à scanner. Une vraie
hiérarchie typographique se lit en moins d'une seconde, même en vision
floue ou réduite.

**Règle opérationnelle.** Trois niveaux de titre maximum par écran :
*display* (h1 unique), *section* (h2), *bloc* (h3). Au-delà, le
contenu est trop profond — extraire dans une sous-page ou un onglet.
Le poids et la taille font la moitié du travail ; la couleur de texte
ne sert qu'à distinguer texte primaire / muet / désactivé.

**Anti-pattern.** Cinq tons de gris pour différencier en-tête, sous-titre,
description, label, valeur, métadonnée. L'œil ne lit plus la
hiérarchie, il devine.

---

## 5. L'animation explique un changement d'état

**Énoncé.** Une animation a une raison fonctionnelle : signaler une
apparition, une disparition, un déplacement, un changement d'état.
Sinon elle ne s'écrit pas.

**Justification.** L'animation décorative coûte trois fois : sur le
budget de calcul, sur le temps perçu, sur la fatigue cognitive de
l'utilisateur qui doit ignorer un mouvement non porteur. La sobriété
augmente la perception de qualité et de vitesse.

**Règle opérationnelle.** Toute animation est rattachée à une catégorie
de `05-motion-grammar.md`. Pas d'animation `loop`, pas de hover qui
scintille, pas de parallax. Les transitions courtes se font en CSS ;
les orchestrations en JS sont l'exception, justifiées par leur cas.

**Anti-pattern.** Un shimmer en boucle sur des skeletons qui restent
affichés trois secondes. Le mouvement gêne la lecture du contenu qui
finit par s'afficher dessous.

---

## 6. La mascotte est un repère, pas un ornement

**Énoncé.** Varde n'apparaît que là où elle améliore la compréhension
ou la mémorisation d'un état. Jamais en décor récurrent.

**Justification.** Une mascotte omniprésente devient un papier peint :
on cesse de la voir. Une mascotte rare devient un signal : sa présence
attire l'attention sur l'écran qui la contient.

**Règle opérationnelle.** Détaillée dans `04-mascot-usage.md`. Test à
trois questions avant chaque apparition ; si une seule réponse est non,
on retire.

**Anti-pattern.** Header global avec la mascotte qui sourit en
permanence dans le coin droit. Footer décoratif avec la mascotte qui
salue. Watermark dans les coins des cards vides.

---

## 7. Self-host first, aucun runtime externe

**Énoncé.** Le dashboard fonctionne sans accès Internet sortant à
l'exécution. Polices, illustrations, icônes — tout est servi depuis
l'origine du dashboard.

**Justification.** Varde est auto-hébergé. Une dépendance runtime à un
CDN externe (polices Google, icônes externes) est un point de panne et
une fuite de métadonnées. Le principe d'autonomie posé dans `CLAUDE.md`
prime sur la facilité d'intégration.

**Règle opérationnelle.** `next/font` ou équivalent self-hostable pour
toute police, jamais de `<link>` vers un CDN tiers en `<head>`. Icônes
en SVG embarqués (pas d'IconFont, pas d'iframe externe). Mascotte en
SVG vectoriel local. Pas de `connect-src` autre que l'origine et l'API
Discord pour les flux explicitement autorisés.

**Anti-pattern.** `<link rel="stylesheet" href="https://fonts.googleapis.com/...">`
en prod, ou import d'une lib d'icônes qui charge ses glyphes via un CDN
au premier rendu.
