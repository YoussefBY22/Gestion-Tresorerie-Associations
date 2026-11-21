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
 * Conversion d'une diapositive en canevas — logique pure, testée.
 *
 * **Correction d'une hypothèse antérieure.** Je pensais brancher le lecteur
 * PowerPoint sur le convertisseur de tableur. C'était une erreur de nature :
 * une feuille Excel est une *grille* dont il faut déduire les positions, une
 * diapositive est déjà un jeu de formes à **coordonnées absolues**. Les
 * forcer dans une grille perdrait la précision qu'elles ont déjà. Les deux
 * convertisseurs restent donc distincts — ils rendent le même `Canevas`, ce
 * qui est la seule chose qui doive être commune.
 *
 * PowerPoint compte en **EMU** (English Metric Units), 914 400 par pouce.
 * C'est une unité entière choisie pour être divisible par 2,54 comme par 72 :
 * la conversion en millimètres est donc exacte, sans arrondi.
 */

/** 914 400 EMU = 1 pouce = 25,4 mm. */
const EMU_PAR_MM = 914400 / 25.4;

export function emuEnMm(emu: number): number {
  return emu / EMU_PAR_MM;
}

/** Les tailles de police d'OOXML sont en centièmes de point. */
export function centiemesEnPoints(centiemes: number): number {
  return centiemes / 100;
}

/* ------------------------------------------------------------------ */
/* Ce qu'un lecteur de présentation doit fournir                       */
/* ------------------------------------------------------------------ */

/** Un passage de texte homogène dans une forme. */
export type PassagePresentation = {
  texte: string;
  gras?: boolean;
  italique?: boolean;
  /** Taille en points. */
  taille?: number;
  couleur?: string;
};

export type FormePresentation = {
  /** Position et taille, en millimètres depuis le coin haut-gauche. */
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  /** Ordre d'apparition dans la diapositive : c'est l'ordre d'empilement. */
  rang: number;
  nom?: string;
  passages: PassagePresentation[];
  alignement?: Alignement;
  alignementVertical?: AlignementVertical;
  fond?: string;
  contour?: string;
  epaisseurContour?: number;
  /** Image : identifiant du fichier une fois déposé dans le stockage. */
  fichierId?: string;
  nomFichier?: string;
  /** Rotation en degrés — relevée pour pouvoir la signaler, pas rendue. */
  rotation?: number;
  /**
   * Tableau PowerPoint (`p:graphicFrame`), quand la forme en porte un.
   *
   * `parts` donne la largeur relative des colonnes : une diapositive les
   * déclare en EMU, le bloc du canevas en fractions.
   */
  tableau?: { parts: number[]; rangees: string[][] };
};

export type DiapositivePresentation = {
  nom: string;
  /** Dimensions de la diapositive, en millimètres. */
  largeur: number;
  hauteur: number;
  formes: FormePresentation[];
};

/* ------------------------------------------------------------------ */
/* Conversion                                                          */
/* ------------------------------------------------------------------ */

/** Texte complet d'une forme, les passages mis bout à bout. */
export function texteDeLaForme(forme: FormePresentation): string {
  return forme.passages
    .map((p) => p.texte)
    .join("")
    .replace(/ /g, " ")
    .trim();
}

/**
 * Mise en forme retenue pour une forme à plusieurs passages.
 *
 * Un bloc de canevas porte **un seul** style. Quand une forme mélange des
 * passages (« Nom : » en gras puis la valeur en maigre), on retient celui du
 * passage le plus long : c'est lui qui donne son allure à la ligne, et
 * découper la forme en autant de blocs rendrait la page inéditable.
 */
export function styleDominant(
  passages: PassagePresentation[]
): PassagePresentation | null {
  const garnis = passages.filter((p) => p.texte.trim().length > 0);
  if (!garnis.length) return null;
  return garnis.reduce((meilleur, courant) =>
    courant.texte.trim().length > meilleur.texte.trim().length ? courant : meilleur
  );
}

export type OptionsImportPresentation = {
  /** Page cible ; par défaut, celle de la diapositive. */
  page?: { largeur: number; hauteur: number };
  /**
   * Met la diapositive à l'échelle de la page. Une diapositive fait souvent
   * 254 × 143 mm (16/9) : posée telle quelle sur un A4 portrait, elle
   * déborderait à droite et laisserait les deux tiers du bas vides.
   */
  ajusterALaPage?: boolean;
};

/**
 * Transpose une diapositive en canevas.
 *
 * Chaque forme devient un bloc : du texte si elle en porte, une image si elle
 * en est une, un aplat sinon. L'ordre de la diapositive devient l'ordre
 * d'empilement — PowerPoint range déjà ses formes du fond vers l'avant.
 */
export function diapositiveVersCanevas(
  diapositive: DiapositivePresentation,
  options: OptionsImportPresentation = {}
): Canevas {
  const page = options.page ?? {
    largeur: diapositive.largeur || A4.largeur,
    hauteur: diapositive.hauteur || A4.hauteur,
  };

  // Facteur unique sur les deux axes : étirer une diapositive déformerait
  // les logos et les proportions voulues par qui l'a composée.
  const facteur =
    options.ajusterALaPage && diapositive.largeur > 0 && diapositive.hauteur > 0
      ? Math.min(page.largeur / diapositive.largeur, page.hauteur / diapositive.hauteur)
      : 1;

  const blocs: Bloc[] = [];
  let compteur = 0;

  for (const forme of [...diapositive.formes].sort((a, b) => a.rang - b.rang)) {
    const cadre = {
      x: forme.x * facteur,
      y: forme.y * facteur,
      largeur: Math.max(1, forme.largeur * facteur),
      hauteur: Math.max(1, forme.hauteur * facteur),
    };
    compteur += 1;
    const plan = compteur - 1;

    if (forme.fichierId) {
      blocs.push({
        id: `ppt-img-${compteur}`,
        type: "IMAGE",
        ...cadre,
        plan,
        nom: forme.nom ?? forme.nomFichier,
        fichierId: forme.fichierId,
        nomFichier: forme.nomFichier ?? "image",
        ajustement: "contenir",
        opacite: 1,
      });
      continue;
    }

    // Un tableau avant tout : une grille de reçu ou de facture est le
    // cœur du document, la perdre en silence vidait l'import de son sens.
    if (forme.tableau && forme.tableau.rangees.length) {
      const { parts, rangees } = forme.tableau;
      // PowerPoint marque la première rangée comme en-tête ; un tableau
      // d'une seule rangée n'en a pas, c'est une ligne de contenu.
      const aEntete = rangees.length > 1;
      const entetes = aEntete ? rangees[0] : parts.map(() => "");
      const corps = aEntete ? rangees.slice(1) : rangees;
      const hauteurLigne = Math.max(
        4,
        cadre.hauteur / Math.max(1, rangees.length)
      );

      blocs.push({
        id: `ppt-tbl-${compteur}`,
        type: "TABLEAU",
        ...cadre,
        plan,
        nom: forme.nom ?? "Tableau",
        colonnes: parts.map((part, i) => ({
          entete: entetes[i] ?? "",
          part,
          alignement: "gauche" as const,
          champ: "",
        })),
        // Le contenu est repris tel quel : c'est un modèle à retoucher, pas
        // des données. Qui veut dérouler une liste renseigne la source.
        source: "",
        lignesManuelles: corps,
        hauteurEntete: aEntete ? hauteurLigne : 0,
        hauteurLigne,
        styleEntete: { ...STYLE_TEXTE_DEFAUT, taille: 9 * facteur, gras: true },
        encadrementEntete: { ...ENCADREMENT_DEFAUT },
        styleCorps: { ...STYLE_TEXTE_DEFAUT, taille: 9 * facteur },
        encadrementCorps: { ...ENCADREMENT_DEFAUT },
        zebrure: "",
        bordure: "#d9d9d9",
        epaisseurBordure: 0.25,
      });
      continue;
    }

    const texte = texteDeLaForme(forme);
    const dominant = styleDominant(forme.passages);
    const aFond = Boolean(forme.fond);
    const aContour = Boolean(forme.contour);

    if (!texte && !aFond && !aContour) continue;

    if (!texte) {
      blocs.push({
        id: `ppt-apl-${compteur}`,
        type: "RECTANGLE",
        ...cadre,
        plan,
        nom: forme.nom,
        encadrement: {
          ...ENCADREMENT_DEFAUT,
          fond: forme.fond ?? "",
          bordure: forme.contour ?? "",
          epaisseurBordure: forme.contour ? (forme.epaisseurContour ?? 0.25) : 0,
        },
      });
      continue;
    }

    blocs.push({
      id: `ppt-txt-${compteur}`,
      type: "TEXTE",
      ...cadre,
      plan,
      nom: forme.nom,
      contenu: texte,
      style: {
        ...STYLE_TEXTE_DEFAUT,
        taille: (dominant?.taille ?? STYLE_TEXTE_DEFAUT.taille) * facteur,
        gras: Boolean(dominant?.gras),
        italique: Boolean(dominant?.italique),
        couleur: dominant?.couleur ?? STYLE_TEXTE_DEFAUT.couleur,
        alignement: forme.alignement ?? "gauche",
        // PowerPoint centre verticalement par défaut dans une zone de texte.
        alignementVertical: forme.alignementVertical ?? "milieu",
      },
      encadrement: {
        ...ENCADREMENT_DEFAUT,
        fond: forme.fond ?? "",
        bordure: forme.contour ?? "",
        epaisseurBordure: forme.contour ? (forme.epaisseurContour ?? 0.25) : 0,
      },
      marge: 1,
    });
  }

  return { largeur: page.largeur, hauteur: page.hauteur, blocs };
}

/** Ce que l'import a laissé de côté, pour le dire plutôt que de le taire. */
export type RapportPresentation = {
  blocs: number;
  images: number;
  /** Tableaux repris tels quels, à retoucher ensuite. */
  tableaux: number;
  /** Formes dont la rotation n'a pas été reprise. */
  rotationsIgnorees: number;
  /** Formes mêlant plusieurs mises en forme, ramenées à la dominante. */
  stylesMelanges: number;
  horsPage: number;
};

export function rapporterPresentation(
  diapositive: DiapositivePresentation,
  canevas: Canevas
): RapportPresentation {
  const stylesMelanges = diapositive.formes.filter((f) => {
    const garnis = f.passages.filter((p) => p.texte.trim());
    if (garnis.length < 2) return false;
    const premier = garnis[0];
    return garnis.some(
      (p) =>
        p.gras !== premier.gras ||
        p.italique !== premier.italique ||
        p.taille !== premier.taille ||
        p.couleur !== premier.couleur
    );
  }).length;

  return {
    blocs: canevas.blocs.filter((b) => b.type !== "IMAGE").length,
    images: canevas.blocs.filter((b) => b.type === "IMAGE").length,
    tableaux: canevas.blocs.filter((b) => b.type === "TABLEAU").length,
    rotationsIgnorees: diapositive.formes.filter(
      (f) => Math.abs(f.rotation ?? 0) > 0.5
    ).length,
    stylesMelanges,
    horsPage: canevas.blocs.filter(
      (b) =>
        b.x + b.largeur > canevas.largeur + 0.5 ||
        b.y + b.hauteur > canevas.hauteur + 0.5
    ).length,
  };
}
