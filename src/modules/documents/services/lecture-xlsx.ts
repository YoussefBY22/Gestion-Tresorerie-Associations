import ExcelJS from "exceljs";
import type {
  CelluleTableur,
  FeuilleTableur,
  ImageTableur,
} from "./import-tableur";
import type { Alignement, AlignementVertical } from "./canevas";

/**
 * Lecture d'un classeur `.xlsx` — la seule partie qui connaisse Excel.
 *
 * Elle ne fait que **normaliser** : elle rend une `FeuilleTableur`, que
 * `import-tableur.ts` transpose ensuite en blocs. La frontière permet de
 * tester toute la conversion sans fichier, et de brancher un jour un lecteur
 * PowerPoint sur le même convertisseur.
 *
 * Les classeurs de la JE viennent de Google Sheets exporté en `.xlsx` : on
 * rencontre donc des couleurs de thème, des polices absentes et des cellules
 * partiellement renseignées. Rien de tout cela ne doit faire échouer la
 * lecture — au pire un attribut manque et retombe sur son défaut.
 */

export type FeuilleDisponible = { nom: string; lignes: number; colonnes: number };

/**
 * Les types d'ExcelJS décrivent des unions strictes (un remplissage peut être
 * uni, en dégradé ou à motif ; une valeur de cellule a sept formes). Les lire
 * à travers ces unions demanderait un garde par propriété. On élargit donc
 * **ici, une fois**, et chaque lecture vérifie ensuite ce qu'elle trouve —
 * ce qui est de toute façon nécessaire : un classeur exporté de Google Sheets
 * omet la moitié des attributs.
 */
type Souple = Record<string, unknown>;

function champ(objet: unknown, cle: string): unknown {
  return objet && typeof objet === "object"
    ? (objet as Souple)[cle]
    : undefined;
}

/** Couleur ARGB d'ExcelJS (`FF2C4A7C`) → `#2c4a7c`. */
function couleurDe(valeur: unknown): string | undefined {
  const argb = champ(valeur, "argb");
  if (typeof argb !== "string") return undefined;

  // ExcelJS rend parfois des couleurs de thème sans ARGB résolu : on les
  // laisse tomber plutôt que d'inventer une teinte.
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  // Le blanc de fond d'Excel est implicite partout : le transposer
  // couvrirait la page d'aplats blancs qui masqueraient tout le reste.
  if (hex.toLowerCase() === "ffffff") return undefined;
  return `#${hex.toLowerCase()}`;
}

/** Couleur de fond d'une cellule — seuls les remplissages unis en ont une. */
function fondDe(cellule: ExcelJS.Cell): string | undefined {
  return couleurDe(champ(cellule.fill, "fgColor"));
}

const ALIGNEMENTS: Record<string, Alignement> = {
  left: "gauche",
  center: "centre",
  right: "droite",
  justify: "gauche",
};

const ALIGNEMENTS_VERTICAUX: Record<string, AlignementVertical> = {
  top: "haut",
  middle: "milieu",
  bottom: "bas",
};

/** Vrai si au moins un côté de la cellule porte un trait. */
function bordureDe(cellule: ExcelJS.Cell): string | undefined {
  const bordures = cellule.border;
  if (!bordures) return undefined;
  for (const cote of ["top", "left", "bottom", "right"] as const) {
    const trait = bordures[cote];
    if (trait?.style) return couleurDe(trait.color) ?? "#15181d";
  }
  return undefined;
}

/**
 * Texte d'une cellule, quelle que soit la forme de sa valeur.
 *
 * ExcelJS rend tantôt une chaîne, tantôt un nombre, une date, un objet de
 * texte enrichi ou un résultat de formule. On aplatit tout, et on signale
 * séparément les formules : leur résultat n'est pas importé.
 */
function texteDe(valeur: ExcelJS.CellValue): {
  texte: string;
  formule: boolean;
} {
  if (valeur === null || valeur === undefined) return { texte: "", formule: false };
  if (typeof valeur === "string") return { texte: valeur, formule: false };
  if (typeof valeur === "number" || typeof valeur === "boolean") {
    return { texte: String(valeur), formule: false };
  }
  if (valeur instanceof Date) {
    return { texte: valeur.toLocaleDateString("fr-FR"), formule: false };
  }

  if (champ(valeur, "formula") || champ(valeur, "sharedFormula")) {
    return { texte: "", formule: true };
  }

  const enrichi = champ(valeur, "richText");
  if (Array.isArray(enrichi)) {
    return {
      texte: enrichi.map((m) => String(champ(m, "text") ?? "")).join(""),
      formule: false,
    };
  }

  const texte = champ(valeur, "text");
  if (typeof texte === "string") return { texte, formule: false };

  const lien = champ(valeur, "hyperlink");
  if (typeof lien === "string") return { texte: lien, formule: false };

  return { texte: "", formule: false };
}

export async function ouvrirClasseur(octets: Uint8Array): Promise<ExcelJS.Workbook> {
  const classeur = new ExcelJS.Workbook();
  // ExcelJS attend un Buffer Node ; un Uint8Array nu le fait échouer sur
  // certains chemins de lecture.
  await classeur.xlsx.load(Buffer.from(octets) as unknown as ArrayBuffer);
  return classeur;
}

/** Les feuilles du classeur, pour laisser choisir laquelle importer. */
export function feuillesDisponibles(
  classeur: ExcelJS.Workbook
): FeuilleDisponible[] {
  return classeur.worksheets.map((feuille) => ({
    nom: feuille.name,
    lignes: feuille.actualRowCount ?? feuille.rowCount ?? 0,
    colonnes: feuille.actualColumnCount ?? feuille.columnCount ?? 0,
  }));
}

/**
 * Nombre de lignes et de colonnes réellement garnies.
 *
 * `rowCount` d'ExcelJS compte jusqu'à la dernière ligne **touchée**, ce qui
 * sur un export Google Sheets vaut souvent 1000 : la feuille du reçu
 * déclarait 996 lignes pour 25 utiles. Sans cette borne, on fabriquerait une
 * page de plusieurs mètres de haut.
 */
function etendueUtile(feuille: ExcelJS.Worksheet): {
  lignes: number;
  colonnes: number;
} {
  let lignes = 0;
  let colonnes = 0;
  feuille.eachRow({ includeEmpty: false }, (ligne, numero) => {
    let garnie = false;
    ligne.eachCell({ includeEmpty: false }, (cellule, numeroColonne) => {
      const { texte } = texteDe(cellule.value);
      const aStyle = Boolean(fondDe(cellule) || bordureDe(cellule));
      if (texte.trim() || aStyle) {
        garnie = true;
        colonnes = Math.max(colonnes, numeroColonne);
      }
    });
    if (garnie) lignes = Math.max(lignes, numero);
  });
  return { lignes, colonnes };
}

export type ImageLue = {
  nom: string;
  type: "png" | "jpeg";
  octets: Uint8Array;
  ligne: number;
  colonne: number;
  largeurPx: number;
  hauteurPx: number;
};

/**
 * Images ancrées dans la feuille, avec leurs octets.
 *
 * L'appelant les dépose dans le stockage de l'application, puis renseigne les
 * `fichierId` : ce service ne connaît pas la base.
 */
export function imagesDeLaFeuille(
  classeur: ExcelJS.Workbook,
  feuille: ExcelJS.Worksheet
): ImageLue[] {
  const lues: ImageLue[] = [];

  for (const ancrage of feuille.getImages()) {
    const media = classeur.getImage(Number(ancrage.imageId));
    if (!media?.buffer) continue;

    const extension = String(champ(media, "extension") ?? "png").toLowerCase();
    if (extension !== "png" && extension !== "jpeg" && extension !== "jpg") {
      // GIF, EMF et consorts : pdf-lib ne sait pas les embarquer.
      continue;
    }

    const plage = champ(ancrage, "range");
    const depart = champ(plage, "tl");
    const arrivee = champ(plage, "br");
    const etendue = champ(plage, "ext");
    // L'ancrage d'ExcelJS compte les cellules à partir de zéro.
    const ligne = Math.round(Number(champ(depart, "nativeRow") ?? 0)) + 1;
    const colonne = Math.round(Number(champ(depart, "nativeCol") ?? 0)) + 1;

    // Taille : celle déclarée, sinon déduite de la plage couverte.
    const largeurPx = Number(champ(etendue, "width") ?? 0);
    const hauteurPx = Number(champ(etendue, "height") ?? 0);
    const colonnes = Math.max(
      1,
      Math.round(Number(champ(arrivee, "nativeCol") ?? colonne)) + 1 - colonne
    );
    const lignes = Math.max(
      1,
      Math.round(Number(champ(arrivee, "nativeRow") ?? ligne)) + 1 - ligne
    );

    lues.push({
      nom: champ(media, "name")
        ? `${String(champ(media, "name"))}.${extension}`
        : `image-${ancrage.imageId}.${extension}`,
      type: extension === "png" ? "png" : "jpeg",
      octets: new Uint8Array(media.buffer as unknown as ArrayBuffer),
      ligne,
      colonne,
      largeurPx: largeurPx > 0 ? largeurPx : colonnes * 64,
      hauteurPx: hauteurPx > 0 ? hauteurPx : lignes * 20,
    });
  }

  return lues;
}

/**
 * Normalise une feuille. `images` est fourni par l'appelant une fois les
 * fichiers déposés — la lecture ne décide pas où vivent les octets.
 */
export function lireFeuille(
  feuille: ExcelJS.Worksheet,
  images: ImageTableur[] = []
): FeuilleTableur {
  const etendue = etendueUtile(feuille);

  const largeursColonnes: number[] = [];
  for (let c = 1; c <= etendue.colonnes; c++) {
    largeursColonnes.push(Number(feuille.getColumn(c).width ?? 0));
  }

  const hauteursLignes: number[] = [];
  for (let l = 1; l <= etendue.lignes; l++) {
    hauteursLignes.push(Number(feuille.getRow(l).height ?? 0));
  }

  const cellules: CelluleTableur[] = [];
  feuille.eachRow({ includeEmpty: false }, (ligne, numeroLigne) => {
    if (numeroLigne > etendue.lignes) return;
    ligne.eachCell({ includeEmpty: false }, (cellule, numeroColonne) => {
      if (numeroColonne > etendue.colonnes) return;
      const { texte, formule } = texteDe(cellule.value);
      const police = cellule.font ?? {};
      cellules.push({
        ligne: numeroLigne,
        colonne: numeroColonne,
        texte,
        formule,
        gras: Boolean(police.bold),
        italique: Boolean(police.italic),
        taille: typeof police.size === "number" ? police.size : undefined,
        couleur: couleurDe(police.color),
        fond: fondDe(cellule),
        alignement: ALIGNEMENTS[cellule.alignment?.horizontal ?? ""],
        alignementVertical: ALIGNEMENTS_VERTICAUX[cellule.alignment?.vertical ?? ""],
        bordure: bordureDe(cellule),
      });
    });
  });

  // ExcelJS expose les fusions sous forme « B3:G3 » ; on les ramène en
  // indices, seule forme que le convertisseur comprenne.
  const fusions = Object.values(
    (feuille.model as { merges?: string[] }).merges ?? []
  )
    .map((plage) => {
      const bornes = String(plage).split(":");
      if (bornes.length !== 2) return null;
      const lire = (ref: string) => {
        const trouve = ref.match(/^([A-Z]+)(\d+)$/i);
        if (!trouve) return null;
        const colonne = trouve[1]
          .toUpperCase()
          .split("")
          .reduce((total, lettre) => total * 26 + (lettre.charCodeAt(0) - 64), 0);
        return { ligne: Number(trouve[2]), colonne };
      };
      const debut = lire(bornes[0]);
      const fin = lire(bornes[1]);
      if (!debut || !fin) return null;
      return {
        ligne: debut.ligne,
        colonne: debut.colonne,
        jusquLigne: fin.ligne,
        jusquColonne: fin.colonne,
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  return {
    nom: feuille.name,
    largeursColonnes,
    hauteursLignes,
    cellules,
    fusions,
    images,
  };
}
