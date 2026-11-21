import { readFileSync } from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

/**
 * Polices des documents émis.
 *
 * Les PDF sortaient en Helvetica, parce que c'est l'une des quatorze polices
 * que tout lecteur PDF possède et qu'elle n'a donc rien à embarquer. Mais la
 * charte de la JE est en **Montserrat**, et un document qui n'est pas dans la
 * police de la maison n'est pas le document de la maison.
 *
 * Les fichiers sont **dans le dépôt**, pas appelés chez Google : une police
 * servie par un tiers est une dépendance qui peut disparaître ou changer, et
 * un document déjà émis doit pouvoir se rééditer à l'identique dans dix ans.
 * Montserrat est sous licence OFL (`public/polices/OFL.txt`), qui autorise
 * explicitement l'embarquement et la redistribution.
 *
 * Si les fichiers manquaient, on retombe sur Helvetica plutôt que de refuser
 * d'émettre : une pièce dans la mauvaise police vaut mieux qu'une pièce
 * absente.
 */

export type Polices = {
  normale: PDFFont;
  grasse: PDFFont;
  italique: PDFFont;
  /** Vrai quand Montserrat a bien été embarquée. */
  montserrat: boolean;
};

const DOSSIER = path.join(process.cwd(), "src/modules/documents/polices");

const FICHIERS = {
  normale: "Montserrat-Regular.ttf",
  grasse: "Montserrat-Bold.ttf",
  italique: "Montserrat-Italic.ttf",
} as const;

/**
 * Les fichiers sont lus une fois pour toute la vie du serveur : ~1 Mo à trois,
 * et les relire à chaque document n'apporterait rien.
 */
let cache: Record<keyof typeof FICHIERS, Buffer> | null = null;

function octetsDesPolices(): Record<keyof typeof FICHIERS, Buffer> | null {
  if (cache) return cache;
  try {
    cache = {
      normale: readFileSync(path.join(DOSSIER, FICHIERS.normale)),
      grasse: readFileSync(path.join(DOSSIER, FICHIERS.grasse)),
      italique: readFileSync(path.join(DOSSIER, FICHIERS.italique)),
    };
    return cache;
  } catch (err) {
    console.error(
      "[polices] Montserrat introuvable, repli sur Helvetica :",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Embarque les trois graisses dans le document.
 *
 * `subset: true` ne garde que les glyphes réellement employés : un reçu pèse
 * quelques dizaines de kilo-octets au lieu d'embarquer un million d'octets de
 * police pour trente mots.
 */
export async function embarquerPolices(pdf: PDFDocument): Promise<Polices> {
  const octets = octetsDesPolices();

  if (octets) {
    try {
      pdf.registerFontkit(fontkit);
      return {
        normale: await pdf.embedFont(octets.normale, { subset: true }),
        grasse: await pdf.embedFont(octets.grasse, { subset: true }),
        italique: await pdf.embedFont(octets.italique, { subset: true }),
        montserrat: true,
      };
    } catch (err) {
      console.error(
        "[polices] Embarquement de Montserrat impossible :",
        err instanceof Error ? err.message : err
      );
    }
  }

  return {
    normale: await pdf.embedFont(StandardFonts.Helvetica),
    grasse: await pdf.embedFont(StandardFonts.HelveticaBold),
    italique: await pdf.embedFont(StandardFonts.HelveticaOblique),
    montserrat: false,
  };
}
