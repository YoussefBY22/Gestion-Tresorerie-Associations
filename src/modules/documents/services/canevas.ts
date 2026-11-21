/**
 * Canevas de document — le modèle de mise en page, logique pure et testée.
 *
 * Le moteur historique (`structure.ts` + `rendu.ts`) décrit un document **en
 * flux** : des blocs s'empilent et le moteur décide où les poser. C'est juste
 * pour un rapport ou un procès-verbal, et c'est précisément ce qui rendait
 * impossible de dire « le cachet va ici ».
 *
 * Le canevas est l'autre moitié : une page sur laquelle des éléments sont
 * **posés à une place choisie**. C'est le modèle des reçus, des factures, des
 * bons de commande — et c'est aussi, par chance, la forme qu'ont déjà les
 * fichiers dont la JE dispose (une feuille Excel est une grille positionnée,
 * une diapositive est un jeu de formes à coordonnées). Importer l'un de ces
 * fichiers reviendra donc à le traduire en blocs, pas à l'interpréter.
 *
 * Unités : **millimètres**, origine en haut à gauche. C'est ce qu'on lit sur
 * une règle et ce que montrent Word et Excel ; la conversion en points PDF et
 * le retournement de l'axe vertical se font au seul moment du rendu.
 *
 * Ce socle est commun à tout l'application : la trésorerie l'inaugure, le secrétariat
 * et les autres modules s'y branchent sans réécrire d'équivalent.
 */

export const A4 = { largeur: 210, hauteur: 297 } as const;

/** 1 mm = 72/25.4 points PostScript. */
export const MM_EN_POINTS = 72 / 25.4;

export function mmEnPoints(mm: number): number {
  return mm * MM_EN_POINTS;
}

/**
 * Ordonnée PDF d'un bloc : le canevas compte depuis le haut, le PDF depuis le
 * bas. L'oubli de ce retournement met tout le document à l'envers, d'où une
 * fonction nommée plutôt qu'un calcul recopié à chaque bloc.
 */
export function ordonneePdf(
  yDepuisLeHaut: number,
  hauteurBloc: number,
  hauteurPage: number = A4.hauteur
): number {
  return mmEnPoints(hauteurPage - yDepuisLeHaut - hauteurBloc);
}

export type Alignement = "gauche" | "centre" | "droite";
export type AlignementVertical = "haut" | "milieu" | "bas";

/** Mise en forme d'un texte, commune aux blocs texte et aux tableaux. */
export type StyleTexte = {
  taille: number;
  gras: boolean;
  italique: boolean;
  couleur: string;
  alignement: Alignement;
  alignementVertical: AlignementVertical;
  /** Multiplicateur de l'interligne, 1,2 par défaut. */
  interligne: number;
  majuscules: boolean;
};

export const STYLE_TEXTE_DEFAUT: StyleTexte = {
  taille: 10,
  gras: false,
  italique: false,
  couleur: "#15181d",
  alignement: "gauche",
  alignementVertical: "haut",
  interligne: 1.2,
  majuscules: false,
};

export type Encadrement = {
  /** Couleur de fond, vide pour transparent. */
  fond: string;
  /** Couleur du trait, vide pour aucun. */
  bordure: string;
  epaisseurBordure: number;
};

export const ENCADREMENT_DEFAUT: Encadrement = {
  fond: "",
  bordure: "",
  epaisseurBordure: 0.25,
};

export type ColonneTableau = {
  entete: string;
  /** Part de la largeur du bloc, en fractions (2 vaut deux fois 1). */
  part: number;
  alignement: Alignement;
  /** Jeton de la donnée à afficher pour chaque ligne, ex. « designation ». */
  champ: string;
};

type BlocCommun = {
  id: string;
  /** Millimètres depuis le bord gauche / le bord haut. */
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  /** Ordre d'empilement : le plus grand passe devant. */
  plan: number;
  /** Nom affiché dans la liste des calques. */
  nom?: string;
  /** Masqué à l'écran comme au rendu, sans être supprimé. */
  masque?: boolean;
};

export type BlocTexte = BlocCommun & {
  type: "TEXTE";
  /** Peut contenir des jetons `{{champ}}`. */
  contenu: string;
  style: StyleTexte;
  encadrement: Encadrement;
  /** Marge intérieure, en millimètres. */
  marge: number;
};

export type BlocRectangle = BlocCommun & {
  type: "RECTANGLE";
  encadrement: Encadrement;
};

export type BlocImage = BlocCommun & {
  type: "IMAGE";
  /** Identifiant GridFS du fichier déposé. */
  fichierId: string;
  nomFichier: string;
  /** « contenir » respecte les proportions, « remplir » occupe tout le cadre. */
  ajustement: "contenir" | "remplir";
  opacite: number;
};

export type BlocTableau = BlocCommun & {
  type: "TABLEAU";
  colonnes: ColonneTableau[];
  /**
   * Jeton du tableau de lignes à dérouler, ex. « lignes ». Vide, le tableau
   * affiche `lignesManuelles` : c'est la différence entre le détail d'une
   * facture, qui vient des données, et une grille qu'on remplit soi-même.
   */
  source: string;
  /** Contenu saisi à la main, une entrée par colonne. */
  lignesManuelles: string[][];
  hauteurEntete: number;
  hauteurLigne: number;
  styleEntete: StyleTexte;
  encadrementEntete: Encadrement;
  styleCorps: StyleTexte;
  encadrementCorps: Encadrement;
  /** Fond alterné une ligne sur deux, vide pour aucun. */
  zebrure: string;
  /** Filets intérieurs entre cellules : couleur vide = aucun. */
  bordure: string;
  epaisseurBordure: number;
};

/**
 * Trait simple — horizontal, vertical ou oblique selon le cadre qu'on lui
 * donne. Un bloc à part plutôt qu'un rectangle très plat : l'épaisseur d'un
 * trait se règle, elle ne se confond pas avec sa hauteur.
 */
export type BlocLigne = BlocCommun & {
  type: "LIGNE";
  orientation: "horizontale" | "verticale";
  couleur: string;
  epaisseur: number;
};

/**
 * Bloc dont le contenu **coule** : titres, paragraphes, listes et tableaux
 * s'enchaînent dans le cadre donné, et le cadre seul est positionné.
 *
 * C'est l'autre moitié du canevas. Un reçu veut chaque élément à sa place ;
 * un procès-verbal ou un contrat n'a pas de place pour chaque phrase — il a
 * un enchaînement, dont la longueur varie d'un document à l'autre. C'est
 * aussi la forme d'un fichier Word, et donc ce qui rend son import possible.
 *
 * La mise en page vit dans `flux-document.ts` ; le type des éléments y est
 * défini, pour que ce fichier n'ait pas à connaître la composition.
 */
export type BlocFlux = BlocCommun & {
  type: "FLUX";
  /** Éléments à enchaîner — voir `ElementFlux` dans `flux-document.ts`. */
  elements: unknown[];
  style: StyleTexte;
  encadrement: Encadrement;
  marge: number;
  couleurTitre: string;
  fondEntete: string;
  couleurEntete: string;
  bordureTableau: string;
};

export type Bloc =
  | BlocTexte
  | BlocRectangle
  | BlocImage
  | BlocTableau
  | BlocLigne
  | BlocFlux;

export type Canevas = {
  largeur: number;
  hauteur: number;
  blocs: Bloc[];
};

export const CANEVAS_VIDE: Canevas = {
  largeur: A4.largeur,
  hauteur: A4.hauteur,
  blocs: [],
};

/* ------------------------------------------------------------------ */
/* Champs variables                                                    */
/* ------------------------------------------------------------------ */

/**
 * Un jeton `{{champ}}` posé dans un texte. La liste des champs disponibles
 * n'est pas inventée : elle se déduit du contrat de données de la famille de
 * document, que l'application possède déjà.
 */
const JETON = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Jetons employés dans un texte, sans doublon et dans l'ordre d'apparition. */
export function jetonsDe(texte: string): string[] {
  const vus = new Set<string>();
  for (const trouve of texte.matchAll(JETON)) vus.add(trouve[1]);
  return [...vus];
}

/** Tous les jetons d'un canevas — sert à dire ce qui reste à relier. */
export function jetonsDuCanevas(canevas: Canevas): string[] {
  const vus = new Set<string>();
  for (const bloc of canevas.blocs) {
    if (bloc.type === "TEXTE") for (const j of jetonsDe(bloc.contenu)) vus.add(j);
    if (bloc.type === "FLUX") {
      // Les jetons d'un bloc en flux sont enfouis dans ses éléments : on les
      // cherche dans sa forme sérialisée, ce qui marche quel que soit le type
      // d'élément sans que ce fichier ait à les connaître.
      for (const j of jetonsDe(JSON.stringify(bloc.elements))) vus.add(j);
    }
    if (bloc.type === "TABLEAU") {
      vus.add(bloc.source);
      for (const c of bloc.colonnes) if (c.entete) for (const j of jetonsDe(c.entete)) vus.add(j);
    }
  }
  return [...vus];
}

/**
 * Lit `client.nom` dans un objet imbriqué. Rend `undefined` plutôt que de
 * lever : un champ absent laisse un blanc, il n'empêche pas d'émettre.
 */
export function valeurDuChemin(
  donnees: Record<string, unknown>,
  chemin: string
): unknown {
  return chemin
    .split(".")
    .reduce<unknown>(
      (courant, cle) =>
        courant && typeof courant === "object"
          ? (courant as Record<string, unknown>)[cle]
          : undefined,
      donnees
    );
}

/** Rend une valeur affichable : dates à la française, nombres à trois décimales. */
export function formaterValeur(valeur: unknown): string {
  if (valeur === null || valeur === undefined) return "";
  if (valeur instanceof Date) return valeur.toLocaleDateString("fr-FR");
  if (typeof valeur === "number") {
    return Number.isInteger(valeur)
      ? valeur.toLocaleString("fr-FR")
      : valeur.toFixed(3).replace(".", ",");
  }
  if (typeof valeur === "boolean") return valeur ? "Oui" : "Non";
  return String(valeur);
}

/**
 * Remplace les jetons par leurs valeurs.
 *
 * Un jeton inconnu devient une chaîne vide plutôt que de rester affiché :
 * voir « {{cotisant}} » imprimé sur un reçu remis à un tiers serait pire que
 * de voir un blanc, qui se remarque et se corrige.
 */
export function remplirJetons(
  texte: string,
  donnees: Record<string, unknown>
): string {
  return texte.replace(JETON, (_, chemin: string) =>
    formaterValeur(valeurDuChemin(donnees, chemin))
  );
}

/* ------------------------------------------------------------------ */
/* Manipulation des blocs                                              */
/* ------------------------------------------------------------------ */

/** Garde un bloc dans la page : on ne pose rien hors de la feuille. */
export function contraindre(bloc: Bloc, canevas: Canevas = CANEVAS_VIDE): Bloc {
  const largeur = Math.max(2, Math.min(bloc.largeur, canevas.largeur));
  const hauteur = Math.max(2, Math.min(bloc.hauteur, canevas.hauteur));
  return {
    ...bloc,
    largeur,
    hauteur,
    x: Math.max(0, Math.min(bloc.x, canevas.largeur - largeur)),
    y: Math.max(0, Math.min(bloc.y, canevas.hauteur - hauteur)),
  };
}

export type FormatPage = "A4_PORTRAIT" | "A4_PAYSAGE";

export const FORMATS_PAGE: Record<
  FormatPage,
  { libelle: string; largeur: number; hauteur: number }
> = {
  A4_PORTRAIT: { libelle: "A4 portrait", largeur: A4.largeur, hauteur: A4.hauteur },
  A4_PAYSAGE: { libelle: "A4 paysage", largeur: A4.hauteur, hauteur: A4.largeur },
};

/** Format d'un canevas, d'après ses dimensions. */
export function formatDuCanevas(canevas: Canevas): FormatPage {
  return canevas.largeur > canevas.hauteur ? "A4_PAYSAGE" : "A4_PORTRAIT";
}

/**
 * Change le format de la page **sans pivoter le contenu**.
 *
 * C'est le geste qu'appelle un classeur importé plus large qu'un A4 : les
 * blocs sont à leur place, c'est la feuille qui est trop étroite. Faire
 * tourner les blocs les déplacerait tous, ce que personne ne demande en
 * passant un tableau en paysage.
 *
 * Les blocs sont ensuite ramenés dans la page : rétrécir une page dont le
 * contenu dépasse n'a pas d'autre issue honnête que de le resserrer, et
 * `blocsHorsPage` permet de prévenir avant de le faire.
 */
export function avecFormat(canevas: Canevas, format: FormatPage): Canevas {
  const { largeur, hauteur } = FORMATS_PAGE[format];
  const page: Canevas = { ...canevas, largeur, hauteur };
  return { ...page, blocs: canevas.blocs.map((b) => contraindre(b, page)) };
}

/** Blocs qui déborderaient d'une page de ce format — à dire avant d'y passer. */
export function blocsHorsPage(canevas: Canevas, format: FormatPage): number {
  const { largeur, hauteur } = FORMATS_PAGE[format];
  return canevas.blocs.filter(
    (b) => b.x + b.largeur > largeur + 0.5 || b.y + b.hauteur > hauteur + 0.5
  ).length;
}

/** Blocs du plus lointain au plus proche — l'ordre de dessin. */
export function parPlan(blocs: Bloc[]): Bloc[] {
  return [...blocs].sort((a, b) => a.plan - b.plan);
}

/**
 * Déplace un bloc d'un cran dans la pile.
 *
 * On échange les plans avec le voisin plutôt que d'incrémenter : sans cela,
 * deux blocs finissent au même plan et leur ordre dépend de celui du tableau,
 * donc du hasard.
 */
export function deplacerDansLaPile(
  blocs: Bloc[],
  id: string,
  sens: "avancer" | "reculer"
): Bloc[] {
  const ordonnes = parPlan(blocs);
  const index = ordonnes.findIndex((b) => b.id === id);
  if (index < 0) return blocs;
  const voisin = sens === "avancer" ? index + 1 : index - 1;
  if (voisin < 0 || voisin >= ordonnes.length) return blocs;

  const planA = ordonnes[index].plan;
  const planB = ordonnes[voisin].plan;
  // Deux blocs au même plan ne s'échangeraient pas : on les écarte d'abord.
  const [nouveauA, nouveauB] =
    planA === planB
      ? sens === "avancer"
        ? [planB + 1, planB]
        : [planB - 1, planB]
      : [planB, planA];

  return blocs.map((b) =>
    b.id === ordonnes[index].id
      ? { ...b, plan: nouveauA }
      : b.id === ordonnes[voisin].id
        ? { ...b, plan: nouveauB }
        : b
  );
}

/** Plan à donner à un bloc qu'on ajoute : devant tout le reste. */
export function planSuivant(blocs: Bloc[]): number {
  return blocs.length ? Math.max(...blocs.map((b) => b.plan)) + 1 : 0;
}

/** Libellé d'un bloc dans la liste des calques. */
export function nomDuBloc(bloc: Bloc): string {
  if (bloc.nom?.trim()) return bloc.nom.trim();
  switch (bloc.type) {
    case "TEXTE":
      return bloc.contenu.replace(/\s+/g, " ").trim().slice(0, 32) || "Texte";
    case "IMAGE":
      return bloc.nomFichier || "Image";
    case "TABLEAU":
      return `Tableau (${bloc.colonnes.length} colonnes)`;
    case "RECTANGLE":
      return "Aplat";
    case "LIGNE":
      return bloc.orientation === "verticale" ? "Trait vertical" : "Trait horizontal";
    case "FLUX":
      return `Texte au fil (${bloc.elements.length} élément(s))`;
  }
}

/* ------------------------------------------------------------------ */
/* Tableaux : lignes et colonnes                                       */
/* ------------------------------------------------------------------ */

/**
 * Opérations sur la grille d'un tableau.
 *
 * Elles portent **ensemble** sur les colonnes et sur chaque ligne saisie :
 * ajouter une colonne sans ajouter sa cellule à toutes les lignes ferait une
 * grille bancale, dont le décalage ne se verrait qu'au rendu.
 */

export function ajouterColonne(
  bloc: BlocTableau,
  index: number,
  cote: "gauche" | "droite"
): BlocTableau {
  const ou = Math.min(
    Math.max(0, cote === "droite" ? index + 1 : index),
    bloc.colonnes.length
  );
  const colonnes = [...bloc.colonnes];
  colonnes.splice(ou, 0, {
    entete: "Colonne",
    part: 1,
    alignement: "centre",
    champ: "",
  });
  return {
    ...bloc,
    colonnes,
    lignesManuelles: bloc.lignesManuelles.map((ligne) => {
      const copie = [...ligne];
      copie.splice(ou, 0, "");
      return copie;
    }),
  };
}

export function supprimerColonne(bloc: BlocTableau, index: number): BlocTableau {
  // Un tableau sans colonne n'est plus un tableau : on garde la dernière.
  if (bloc.colonnes.length <= 1) return bloc;
  return {
    ...bloc,
    colonnes: bloc.colonnes.filter((_, i) => i !== index),
    lignesManuelles: bloc.lignesManuelles.map((ligne) =>
      ligne.filter((_, i) => i !== index)
    ),
  };
}

export function ajouterLigne(
  bloc: BlocTableau,
  index: number,
  cote: "dessus" | "dessous"
): BlocTableau {
  const ou = Math.min(
    Math.max(0, cote === "dessous" ? index + 1 : index),
    bloc.lignesManuelles.length
  );
  const lignes = [...bloc.lignesManuelles];
  lignes.splice(ou, 0, bloc.colonnes.map(() => ""));
  return { ...bloc, lignesManuelles: lignes };
}

export function supprimerLigne(bloc: BlocTableau, index: number): BlocTableau {
  return {
    ...bloc,
    lignesManuelles: bloc.lignesManuelles.filter((_, i) => i !== index),
  };
}

/** Contenu d'une cellule saisie à la main, sans sortir du tableau. */
export function majCellule(
  bloc: BlocTableau,
  ligne: number,
  colonne: number,
  valeur: string
): BlocTableau {
  return {
    ...bloc,
    lignesManuelles: bloc.lignesManuelles.map((l, i) =>
      i === ligne ? l.map((c, j) => (j === colonne ? valeur : c)) : l
    ),
  };
}

/** Largeurs des colonnes en millimètres, réparties selon leurs parts. */
export function largeursColonnes(bloc: BlocTableau): number[] {
  const total = bloc.colonnes.reduce((s, c) => s + Math.max(0.01, c.part), 0);
  return bloc.colonnes.map((c) => (Math.max(0.01, c.part) / total) * bloc.largeur);
}

/* ------------------------------------------------------------------ */
/* Sélection multiple                                                  */
/* ------------------------------------------------------------------ */

export type Rectangle = { x: number; y: number; largeur: number; hauteur: number };

/** Deux cadres se touchent-ils ? Sert au lasso de sélection. */
export function seChevauchent(a: Rectangle, b: Rectangle): boolean {
  return (
    a.x < b.x + b.largeur &&
    a.x + a.largeur > b.x &&
    a.y < b.y + b.hauteur &&
    a.y + a.hauteur > b.y
  );
}

/** Cadre normalisé entre deux points — le lasso se trace dans tous les sens. */
export function cadreEntre(
  depart: { x: number; y: number },
  arrivee: { x: number; y: number }
): Rectangle {
  return {
    x: Math.min(depart.x, arrivee.x),
    y: Math.min(depart.y, arrivee.y),
    largeur: Math.abs(arrivee.x - depart.x),
    hauteur: Math.abs(arrivee.y - depart.y),
  };
}

/** Blocs touchés par le lasso, les masqués exclus — on ne saisit pas l'invisible. */
export function blocsDansLeCadre(blocs: Bloc[], cadre: Rectangle): string[] {
  return blocs
    .filter((b) => !b.masque && seChevauchent(b, cadre))
    .map((b) => b.id);
}
