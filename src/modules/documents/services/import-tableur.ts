import {
  A4,
  ENCADREMENT_DEFAUT,
  STYLE_TEXTE_DEFAUT,
  type Alignement,
  type AlignementVertical,
  type Bloc,
  type Canevas,
} from "./canevas";

/**
 * Conversion d'une feuille de tableur en canevas — logique pure, testée.
 *
 * Une feuille Excel n'est pas une image : le fichier dit déjà, noir sur blanc,
 * « cette cellule est à telle position, fond #15181d, Montserrat 12 gras,
 * blanc, fusionnée sur cinq colonnes ». Il n'y a donc **rien à deviner** : on
 * lit et on transpose. C'est ce qui rend l'import des modèles du drive
 * réaliste là où une reconnaissance d'image ne le serait pas.
 *
 * Ce fichier ne connaît ni Excel ni aucune bibliothèque : il reçoit une
 * description déjà normalisée (`FeuilleTableur`) et rend des blocs. La lecture
 * du `.xlsx` vit à côté, dans `lecture-xlsx.ts`. La séparation permet de
 * tester toute la conversion sans fichier, et de brancher plus tard un
 * lecteur PowerPoint sur le même convertisseur.
 *
 * Ce qui n'est **pas** transposé, volontairement : les formules. Une facture
 * importée ne doit pas recalculer son total dans le document — les montants
 * viennent de l'application, qui en est la source. Une cellule de formule devient un
 * blanc, que l'on remplace par le jeton qui convient.
 */

/* ------------------------------------------------------------------ */
/* Ce qu'un lecteur de tableur doit fournir                            */
/* ------------------------------------------------------------------ */

export type CelluleTableur = {
  /** Indices à partir de 1, comme dans Excel. */
  ligne: number;
  colonne: number;
  texte: string;
  /** Vrai si la valeur vient d'une formule : on n'importe pas le calcul. */
  formule?: boolean;
  gras?: boolean;
  italique?: boolean;
  /** Taille en points. */
  taille?: number;
  /** Couleur du texte, `#rrggbb`. */
  couleur?: string;
  /** Couleur de fond, `#rrggbb`. */
  fond?: string;
  alignement?: Alignement;
  alignementVertical?: AlignementVertical;
  /** Couleur du contour, s'il y en a un sur au moins un côté. */
  bordure?: string;
};

export type FusionTableur = {
  ligne: number;
  colonne: number;
  jusquLigne: number;
  jusquColonne: number;
};

export type ImageTableur = {
  /** Ancrage en indices de cellule, à partir de 1. */
  ligne: number;
  colonne: number;
  largeurPx: number;
  hauteurPx: number;
  /** Identifiant du fichier une fois déposé dans le stockage de l'application. */
  fichierId: string;
  nomFichier: string;
};

export type FeuilleTableur = {
  nom: string;
  /** Largeur de chaque colonne, en « caractères » Excel. */
  largeursColonnes: number[];
  /** Hauteur de chaque ligne, en points. */
  hauteursLignes: number[];
  cellules: CelluleTableur[];
  fusions: FusionTableur[];
  images: ImageTableur[];
};

/* ------------------------------------------------------------------ */
/* Unités                                                              */
/* ------------------------------------------------------------------ */

/**
 * Largeur Excel → millimètres.
 *
 * Excel compte en « caractères » de la police par défaut : la largeur en
 * pixels vaut `caractères × 7 + 5`, à 96 points par pouce. La formule est
 * approximative par nature — c'est celle d'Excel lui-même, qui dépend de la
 * police. Un écart de l'ordre du millimètre est donc attendu, et se rattrape
 * en déplaçant le bloc à la souris.
 */
export function largeurEnMm(caracteres: number): number {
  const pixels = caracteres > 0 ? caracteres * 7 + 5 : 0;
  return (pixels * 25.4) / 96;
}

/** Hauteur de ligne Excel (points) → millimètres. */
export function hauteurEnMm(points: number): number {
  return (points * 25.4) / 72;
}

/** Taille d'une image, en pixels à 96 ppp → millimètres. */
export function pixelsEnMm(pixels: number): number {
  return (pixels * 25.4) / 96;
}

/** Largeur par défaut d'une colonne Excel, en caractères. */
const LARGEUR_COLONNE_DEFAUT = 8.43;
/** Hauteur par défaut d'une ligne Excel, en points. */
const HAUTEUR_LIGNE_DEFAUT = 15;

/**
 * Position cumulée du bord gauche de chaque colonne, en millimètres.
 * Rendue pour `colonnes.length + 1` entrées : la dernière est le bord droit.
 */
export function bordsColonnes(largeurs: number[]): number[] {
  const bords = [0];
  for (const largeur of largeurs) {
    bords.push(
      bords[bords.length - 1] +
        largeurEnMm(largeur > 0 ? largeur : LARGEUR_COLONNE_DEFAUT)
    );
  }
  return bords;
}

/** Position cumulée du bord haut de chaque ligne, en millimètres. */
export function bordsLignes(hauteurs: number[]): number[] {
  const bords = [0];
  for (const hauteur of hauteurs) {
    bords.push(
      bords[bords.length - 1] +
        hauteurEnMm(hauteur > 0 ? hauteur : HAUTEUR_LIGNE_DEFAUT)
    );
  }
  return bords;
}

/* ------------------------------------------------------------------ */
/* Conversion                                                          */
/* ------------------------------------------------------------------ */

type Geometrie = { x: number; y: number; largeur: number; hauteur: number };

/** Cadre d'une plage de cellules, marges du document comprises. */
function cadreDe(
  plage: FusionTableur,
  colonnes: number[],
  lignes: number[],
  decalage: { x: number; y: number }
): Geometrie {
  const borne = (bords: number[], index: number) =>
    bords[Math.min(Math.max(index, 0), bords.length - 1)];

  const x = borne(colonnes, plage.colonne - 1);
  const y = borne(lignes, plage.ligne - 1);
  return {
    x: x + decalage.x,
    y: y + decalage.y,
    largeur: Math.max(1, borne(colonnes, plage.jusquColonne) - x),
    hauteur: Math.max(1, borne(lignes, plage.jusquLigne) - y),
  };
}

export type OptionsImport = {
  /** Page cible ; A4 portrait par défaut. */
  page?: { largeur: number; hauteur: number };
  /**
   * Décalage appliqué à tout le contenu, en millimètres. Les tableurs placent
   * souvent le document à partir de la cellule A1 sans marge ; un document
   * imprimé en veut une.
   */
  marge?: number;
};

/**
 * Transpose une feuille en canevas.
 *
 * Chaque cellule non vide devient un bloc texte à la place et aux dimensions
 * qu'elle occupe. Une cellule fusionnée donne un seul bloc couvrant toute la
 * plage — sans quoi un titre centré sur sept colonnes se retrouverait coupé
 * en sept morceaux.
 *
 * Les blocs sont empilés dans l'ordre de lecture, les images en dernier :
 * un logo ou un cachet se pose **par-dessus**, c'est sa raison d'être.
 */
export function feuilleVersCanevas(
  feuille: FeuilleTableur,
  options: OptionsImport = {}
): Canevas {
  const page = options.page ?? { largeur: A4.largeur, hauteur: A4.hauteur };
  const marge = options.marge ?? 0;
  const decalage = { x: marge, y: marge };

  const colonnes = bordsColonnes(feuille.largeursColonnes);
  const lignes = bordsLignes(feuille.hauteursLignes);

  // Une cellule fusionnée n'est portée que par son coin haut-gauche ; les
  // autres cellules de la plage doivent être ignorées, sinon on empile des
  // blocs vides par-dessus le titre.
  const couvertes = new Set<string>();
  const plageDe = new Map<string, FusionTableur>();
  for (const fusion of feuille.fusions) {
    for (let l = fusion.ligne; l <= fusion.jusquLigne; l++) {
      for (let c = fusion.colonne; c <= fusion.jusquColonne; c++) {
        if (l === fusion.ligne && c === fusion.colonne) {
          plageDe.set(`${l}:${c}`, fusion);
        } else {
          couvertes.add(`${l}:${c}`);
        }
      }
    }
  }

  const blocs: Bloc[] = [];
  let plan = 0;
  let compteur = 0;

  for (const cellule of feuille.cellules) {
    const cle = `${cellule.ligne}:${cellule.colonne}`;
    if (couvertes.has(cle)) continue;

    const texte = cellule.formule ? "" : cellule.texte.trim();
    const aFond = Boolean(cellule.fond);
    const aBordure = Boolean(cellule.bordure);
    // Une cellule vide, sans fond ni filet, ne porte rien : l'importer
    // couvrirait la page de blocs invisibles et illisibles dans les calques.
    if (!texte && !aFond && !aBordure) continue;

    const plage = plageDe.get(cle) ?? {
      ligne: cellule.ligne,
      colonne: cellule.colonne,
      jusquLigne: cellule.ligne,
      jusquColonne: cellule.colonne,
    };
    const cadre = cadreDe(plage, colonnes, lignes, decalage);

    compteur += 1;
    blocs.push({
      id: `xls-${compteur}`,
      type: "TEXTE",
      ...cadre,
      plan: plan++,
      contenu: texte,
      style: {
        ...STYLE_TEXTE_DEFAUT,
        taille: cellule.taille ?? STYLE_TEXTE_DEFAUT.taille,
        gras: Boolean(cellule.gras),
        italique: Boolean(cellule.italique),
        couleur: cellule.couleur ?? STYLE_TEXTE_DEFAUT.couleur,
        alignement: cellule.alignement ?? "gauche",
        // Excel aligne verticalement en bas par défaut, ce qui donne un
        // rendu flottant ; au milieu, une cellule ressemble à ce qu'on voit
        // dans le tableur.
        alignementVertical: cellule.alignementVertical ?? "milieu",
      },
      encadrement: {
        ...ENCADREMENT_DEFAUT,
        fond: cellule.fond ?? "",
        bordure: cellule.bordure ?? "",
        epaisseurBordure: cellule.bordure ? 0.25 : 0,
      },
      marge: 1,
    });
  }

  for (const image of feuille.images) {
    const cadre = cadreDe(
      {
        ligne: image.ligne,
        colonne: image.colonne,
        jusquLigne: image.ligne,
        jusquColonne: image.colonne,
      },
      colonnes,
      lignes,
      decalage
    );
    compteur += 1;
    blocs.push({
      id: `xls-img-${compteur}`,
      type: "IMAGE",
      x: cadre.x,
      y: cadre.y,
      largeur: Math.max(5, pixelsEnMm(image.largeurPx)),
      hauteur: Math.max(5, pixelsEnMm(image.hauteurPx)),
      plan: plan++,
      nom: image.nomFichier,
      fichierId: image.fichierId,
      nomFichier: image.nomFichier,
      ajustement: "contenir",
      opacite: 1,
    });
  }

  return { largeur: page.largeur, hauteur: page.hauteur, blocs };
}

/**
 * Ce que l'import a laissé de côté, pour le dire à qui importe plutôt que de
 * le lui laisser découvrir sur le document fini.
 */
export type RapportImport = {
  blocs: number;
  images: number;
  formulesIgnorees: number;
  /** Blocs dont une partie sort de la page. */
  horsPage: number;
};

export function rapporterImport(
  feuille: FeuilleTableur,
  canevas: Canevas
): RapportImport {
  const horsPage = canevas.blocs.filter(
    (b) =>
      b.x + b.largeur > canevas.largeur + 0.5 ||
      b.y + b.hauteur > canevas.hauteur + 0.5
  ).length;

  return {
    blocs: canevas.blocs.filter((b) => b.type !== "IMAGE").length,
    images: canevas.blocs.filter((b) => b.type === "IMAGE").length,
    formulesIgnorees: feuille.cellules.filter((c) => c.formule).length,
    horsPage,
  };
}
