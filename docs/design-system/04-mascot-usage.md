# 04 — Usage de la mascotte

La mascotte n'existe pas encore en asset. Ce document fixe les règles
d'usage **avant** sa production graphique, pour que la commande à
l'illustrateur (interne ou externe) parte d'une cible claire. Tant
qu'elle n'est pas livrée, les écrans qui prévoient son apparition
affichent un placeholder neutre (icône Lucide `Compass` sur fond
`--bg-surface-2`) et marquent un TODO d'intégration dans le code.

## 1. Principe

La mascotte sert la **compréhension**, jamais la **décoration**. Elle
est un repère qui aide l'utilisateur à reconnaître un état, à se
souvenir d'un écran, à prendre une action. Sa présence est rare et
chargée de sens.

Une mascotte vue trop souvent devient invisible. Une mascotte vue au
bon moment devient un signal et se mémorise.

## 2. Cas d'usage autorisés

Liste exhaustive. Toute apparition hors de cette liste demande une
décision documentée dans `decisions.md`.

| Cas                                           | Posture          | Pourquoi                                                                                |
|-----------------------------------------------|------------------|-----------------------------------------------------------------------------------------|
| **Accueil / connexion (page `/` non-auth)**   | content          | Premier contact, humanise un écran technique. Atteste que l'instance est vivante.       |
| **Setup wizard — étape welcome**              | neutre           | Annonce un parcours. La mascotte introduit, ne célèbre pas.                             |
| **Setup wizard — étape summary (succès)**     | fier             | Moment de complétion légitime, signal visuel de fin.                                    |
| **Empty state majeur** : 0 guildes, 0 modules | perdu / neutre   | Aide à comprendre que la situation est anormale et invite à l'action.                   |
| **Erreur 404**                                | perdu            | "Cette page n'existe pas" → posture qui matche.                                         |
| **Erreur 500 / 503**                          | surpris          | Quelque chose d'inattendu vient de se produire côté serveur.                            |
| **Erreur 403**                                | neutre           | Pas un drame, juste un blocage de droits — posture neutre, copy explique.               |
| **Drawer d'aide contextuelle (header)**       | neutre           | Identifie l'aide comme un guide, pas un manuel administratif.                           |
| **Toast de confirmation rare**                | content          | Réservé aux actions majeures (instance créée, 1ʳᵉ install). Pas pour un simple save.    |
| **Easter egg contextuel**                     | au choix         | Réservé. Cf. §6 pour les contraintes.                                                   |

## 3. Cas d'usage interdits

Liste explicite. Si une demande de design tombe dans une de ces
catégories, refuser ou trouver l'alternative.

- Header global de l'application (la mascotte n'est pas un logo qu'on
  ressasse à chaque écran).
- Footer récurrent.
- Watermark dans les coins de cards vides.
- Fond décoratif d'une page.
- Illustration de remplissage dans un wireframe pour "donner vie".
- Décor de loader / skeleton.
- Toast de save de routine, toast de modification mineure.
- Avatars utilisateurs par défaut (la mascotte n'est pas Varde l'admin,
  elle est Varde la marque).
- Favicon ou icône de l'app dans l'OS — c'est un logo séparé. La
  mascotte est un personnage, pas un identifiant système.
- Pictogrammes qui pourraient être une icône Lucide claire (rondelle de
  modération, gear de paramètres, etc.).

## 4. Règles techniques

- **Format** : SVG vectoriel. Pas de PNG, pas de WebP. La mascotte doit
  rester nette à toute taille et inverser correctement entre dark et
  light.
- **Variantes d'expression livrées** : 5 minimum.
  1. *Neutre* — regard frontal, expression posée.
  2. *Content* — sourire discret, ouverture du regard.
  3. *Surpris* — yeux écarquillés, pas de bouche ouverte exagérée.
  4. *Perdu* — regard légèrement détourné, posture interrogative.
  5. *Fier* — léger redressement, petit sourire.
- **Tailles standardisées** : `64`, `96`, `128`, `192`, `256` px de
  côté. Le SVG est livré à `256` ; les tailles inférieures sont
  obtenues par `width`/`height` HTML, jamais par re-export.
- **Zone de protection** : marge libre de **¼ de la hauteur** sur
  chaque côté. Aucun texte, badge ou autre élément ne pénètre cette
  zone.
- **Contraste** : la mascotte doit lire correctement sur `--bg-page`
  dark **et** light. Si une couleur de la mascotte tombe sous le ratio
  3:1 contre l'un des deux fonds, la variante du mode concerné utilise
  un `stroke` ou un fond dérivé pour renforcer la silhouette.
- **Couleurs internes** : palette restreinte à `--iris-*` + ash neutre.
  Pas de troisième couleur d'accent. La mascotte vit dans la palette
  produit.
- **Aucun gradient interne**. Si un volume doit être rendu, c'est par
  des aplats stratifiés (ombrage en couches solides).
- **Animations** : autorisées seulement sur les apparitions
  (cf. `05-motion-grammar.md` catégorie *narrative*). Pas d'idle
  loop.
- **Accessibilité** : `<svg role="img" aria-label="...">` avec un libellé
  contextuel ("Page introuvable", "Bienvenue sur Varde", etc.). Si
  décorative malgré tout (cas exceptionnel), `aria-hidden="true"` et
  texte alternatif via le contenu environnant.

## 5. Test de présence à 3 questions

À appliquer pour **chaque** apparition projetée, avant intégration :

1. **Est-ce qu'elle aide à comprendre l'écran ?**
   La mascotte porte-t-elle de l'information sur l'état ou la posture
   attendue ? (Ex : *perdu* sur 404 = oui ; sourire sur header global =
   non.)
2. **Est-ce qu'elle remplace utilement du texte ou une icône ?**
   Une icône Lucide claire ferait-elle aussi bien ? Si oui, l'icône
   gagne — moins de poids, plus de neutralité.
3. **Est-ce que son absence dégraderait l'écran ?**
   Si on la retire, l'écran perd-il en clarté ou en chaleur ? Si la
   réponse est "non, ce serait pareil", retirer.

Si **une seule** réponse est non, la mascotte ne s'affiche pas. La
règle est conservatrice volontairement : il vaut mieux une mascotte
absente qu'une mascotte décorative.

## 6. Easter eggs — contraintes

Les easter eggs sont autorisés mais soumis à trois règles strictes :

1. **Découverte à l'intention** : déclenchés par une action volontaire
   (Konami code, click long sur le logo, etc.), jamais au hasard. Pas
   d'easter egg qui peut surprendre un utilisateur en train de
   travailler.
2. **Sans coût UX** : ils ne ralentissent pas, ne bloquent pas, ne
   modifient aucun état persistant.
3. **Discrétion** : `prefers-reduced-motion` les désactive
   intégralement. Aucun easter egg n'est sonore.

## 7. Workflow d'intégration

1. Le besoin d'une apparition est identifié dans `03-screens-map.md`
   ou par une demande explicite.
2. Test des 3 questions appliqué dans le ticket.
3. Variante d'expression choisie parmi les 5 disponibles.
4. Taille fixée parmi les 5 standards.
5. Intégration via le composant `<Mascot expression={...} size={...}/>`
   (à créer en PR dédiée, hors scope de ce cadrage).
6. Audit a11y (`aria-label` cohérent avec le contexte).
7. Audit visuel : la mascotte n'écrase pas le texte ni le CTA primaire ;
   elle reste sous 30 % de la hauteur du bloc qui la contient.

## 8. Production graphique — cahier des charges minimal

À fournir à l'illustrateur si on commande la mascotte en externe :

- Caractère général : explorateur boussole, pas peluche. La mascotte
  est compagnon de route, pas mascotte sportive.
- Lecture à 64 px : la silhouette doit rester reconnaissable au plus
  petit format livré.
- Cinq expressions livrées en SVG individuels, viewbox identique pour
  permettre les transitions sans saut.
- Test obligatoire avant validation : impression sur fond ash et fond
  paper, vérification du contraste à l'œil.
- Livraison : un repo / dossier `apps/dashboard/public/mascot/` avec
  `mascot-{expression}.svg` (5 fichiers) + un `LICENSE.txt` confirmant
  les droits d'usage du dessin (de préférence cession totale au projet).
