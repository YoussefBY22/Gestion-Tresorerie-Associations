"use server";

import { revalidatePath } from "next/cache";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDb } from "@/lib/db";
import { exigerModuleEtPermission } from "@/lib/autorisation";
import { journaliser } from "@/modules/core/services/journal";
import { ModeleDocumentModel } from "@/modules/documents/models/ModeleDocument";
import { enregistrerFichier } from "@/modules/documents/services/stockage";
import {
  feuillesDisponibles,
  imagesDeLaFeuille,
  lireFeuille,
  ouvrirClasseur,
} from "@/modules/documents/services/lecture-xlsx";
import {
  feuilleVersCanevas,
  rapporterImport,
  type ImageTableur,
  type RapportImport,
} from "@/modules/documents/services/import-tableur";
import {
  diapositivesDisponibles,
  lireDiapositive,
  ouvrirPresentation,
} from "@/modules/documents/services/lecture-pptx";
import {
  diapositiveVersCanevas,
  rapporterPresentation,
  type RapportPresentation,
} from "@/modules/documents/services/import-presentation";
import {
  A4,
  ENCADREMENT_DEFAUT,
  STYLE_TEXTE_DEFAUT,
} from "@/modules/documents/services/canevas";
import {
  htmlVersFlux,
  type RapportTexte,
} from "@/modules/documents/services/import-texte";

/**
 * Import d'un modèle depuis un classeur, une présentation ou un document.
 *
 * La JE tient sa bibliothèque de modèles dans Google Sheets et Google Slides
 * depuis des années. Les reprendre à la main dans l'éditeur serait un travail
 * de copiste — et ces fichiers disent déjà tout ce qu'il faut savoir :
 * position, taille, fusion, couleur, police, images ancrées. On lit et on
 * transpose.
 *
 * Deux choses ne sont volontairement **pas** reprises :
 * - **les formules**, dont le résultat appartient à l'application et non au document.
 *   Les cellules concernées arrivent vides, à remplacer par le jeton voulu ;
 * - **le texte d'exemple**, qui reste tel quel. C'est au Trésorier de le
 *   remplacer par un champ, et c'est volontaire : deviner qu'un nom propre
 *   est « le cotisant » reviendrait à parier sur une pièce comptable.
 */

const TAILLE_MAX = 10_000_000; // 10 Mo — un modèle, pas une base de données.

/** Les trois formats que l'on sait lire. Google exporte nativement vers eux. */
export type FormatImport = "xlsx" | "pptx" | "docx";

export type ResultatImport = {
  modeleId: string;
  format: FormatImport;
  /** Nom de la feuille, numéro de la diapositive, ou corps du document. */
  partie: string;
  /**
   * Ce qui est entré, en une phrase. Les trois formats ne comptent pas les
   * mêmes choses — un classeur des blocs, un document des éléments au fil —
   * et c'est au serveur de le formuler plutôt qu'à l'écran de le deviner.
   */
  resume: string;
  rapport: RapportImport | RapportPresentation | RapportTexte;
};

/** Une feuille, une diapositive ou le corps d'un document, pour choisir. */
export type PartieDisponible = {
  cle: string;
  libelle: string;
  elements: number;
};

/**
 * Ce qu'un fichier contient, avant de choisir quoi en reprendre.
 *
 * Un classeur de la JE compte six feuilles dont deux sont des modèles ;
 * une présentation peut en compter vingt. Importer la première venue
 * produirait un document absurde.
 */
export async function listerPartiesDuFichier(
  formData: FormData
): Promise<{ format: FormatImport; parties: PartieDisponible[] }> {
  await exigerModuleEtPermission("tresorerie", "ecrire");
  const { fichier, format } = lireFichierDeposé(formData);
  const octets = new Uint8Array(await fichier.arrayBuffer());

  if (format === "docx") {
    // Un document Word n'a qu'un corps : il n'y a rien à choisir, mais on
    // annonce quand même ce qu'on y a trouvé.
    const { rapport } = htmlVersFlux(await htmlDuDocument(octets));
    return {
      format,
      parties: [
        {
          cle: "corps",
          libelle: "Corps du document",
          elements: rapport.elements,
        },
      ],
    };
  }

  if (format === "pptx") {
    const parties = diapositivesDisponibles(ouvrirPresentation(octets))
      .filter((d) => d.formes > 0)
      .map((d) => ({
        cle: String(d.numero),
        libelle: `Diapositive ${d.numero}`,
        elements: d.formes,
      }));
    return { format, parties };
  }

  const classeur = await ouvrirClasseur(octets);
  const parties = feuillesDisponibles(classeur)
    .filter((f) => f.lignes > 0)
    .map((f) => ({ cle: f.nom, libelle: f.nom, elements: f.lignes }));
  return { format, parties };
}

function lireFichierDeposé(formData: FormData): {
  fichier: File;
  format: FormatImport;
} {
  const fichier = formData.get("classeur");
  if (!(fichier instanceof File) || fichier.size === 0) {
    throw new Error("Choisissez un fichier à importer.");
  }

  const nom = fichier.name.toLowerCase();
  const format: FormatImport | null = nom.endsWith(".xlsx")
    ? "xlsx"
    : nom.endsWith(".pptx")
      ? "pptx"
      : nom.endsWith(".docx")
        ? "docx"
        : null;
  if (!format) {
    throw new Error(
      "Format non pris en charge : déposez un .xlsx, un .pptx ou un .docx. Depuis Google, « Fichier → Télécharger » puis le format Microsoft correspondant."
    );
  }
  if (fichier.size > TAILLE_MAX) {
    throw new Error(
      `Fichier trop lourd (${Math.round(fichier.size / 1024 / 1024)} Mo) : 10 Mo au maximum.`
    );
  }
  return { fichier, format };
}

/**
 * Importe une feuille et en fait un modèle de document.
 *
 * Les images ancrées dans la feuille sont déposées dans le stockage de l'application
 * **avant** la conversion : les blocs ont besoin de leur identifiant, pas de
 * leurs octets.
 */
/**
 * Importe une feuille ou une diapositive et en fait un modèle de document.
 *
 * Les images sont déposées dans le stockage de l'application **avant** la conversion :
 * les blocs ont besoin de leur identifiant, pas de leurs octets.
 */
export async function importerClasseur(
  formData: FormData
): Promise<ResultatImport> {
  const session = await exigerModuleEtPermission("tresorerie", "ecrire");
  const donnees = z
    .object({
      nom: z.string().min(2).max(80),
      partie: z.string().max(120).optional(),
      marge: z.coerce.number().min(0).max(40),
      /** Ramène une diapositive au format de la page sans la déformer. */
      ajusterALaPage: z.boolean(),
    })
    .parse({
      nom: formData.get("nom"),
      partie: formData.get("partie") || undefined,
      marge: formData.get("marge") ?? 6,
      ajusterALaPage: formData.get("ajusterALaPage") === "on",
    });

  const { fichier, format } = lireFichierDeposé(formData);
  const octets = new Uint8Array(await fichier.arrayBuffer());
  await connectDb();

  const importe =
    format === "pptx"
      ? await depuisPresentation(octets, donnees, fichier.name)
      : format === "docx"
        ? await depuisDocument(octets, donnees)
        : await depuisClasseur(octets, donnees, fichier.name);

  const modele = await ModeleDocumentModel.create({
    nom: donnees.nom,
    modeles: [],
    largeur: importe.canevas.largeur,
    hauteur: importe.canevas.hauteur,
    blocs: importe.canevas.blocs,
    images: importe.images,
    creePar: session.user?.id ? new Types.ObjectId(session.user.id) : undefined,
  });

  await journaliser(session, {
    action: "tresorerie.modeleCanevas.importer",
    entite: "ModeleDocument",
    entiteId: String(modele._id),
    details: `${donnees.nom} ← ${fichier.name} / ${importe.partie} — ${importe.resume}`,
  });

  revalidatePath("/tresorerie/documentation/modeles");
  return {
    modeleId: String(modele._id),
    format,
    partie: importe.partie,
    resume: importe.resume,
    rapport: importe.rapport,
  };
}

type Demande = { partie?: string; marge: number; ajusterALaPage: boolean };

type Importe = {
  partie: string;
  /** Ce que l'import a produit, en une phrase, pour le journal d'activité. */
  resume: string;
  canevas: { largeur: number; hauteur: number; blocs: unknown[] };
  images: { fichierId: Types.ObjectId; nom: string; type: "png" | "jpeg" }[];
  rapport: RapportImport | RapportPresentation | RapportTexte;
};

/**
 * HTML du corps d'un document Word.
 *
 * `mammoth` est chargé à la demande : il pèse lourd et ne sert qu'à l'import
 * d'un `.docx`, qui n'arrive pas à chaque émission de reçu.
 */
async function htmlDuDocument(octets: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  try {
    const { value } = await mammoth.convertToHtml({
      buffer: Buffer.from(octets),
    });
    return value;
  } catch {
    throw new Error(
      "Document illisible : ce n'est pas un .docx valide. Depuis Google Docs, « Fichier → Télécharger → Microsoft Word »."
    );
  }
}

/**
 * Un document Word devient **un seul bloc en flux**, posé dans les marges de
 * la page.
 *
 * C'est la nature du fichier : un texte qui coule n'a pas de coordonnées à
 * reprendre. Le découper en blocs positionnés aurait figé une mise en page
 * qui doit justement s'adapter à la longueur du contenu.
 */
async function depuisDocument(
  octets: Uint8Array,
  donnees: Demande
): Promise<Importe> {
  const { elements, rapport } = htmlVersFlux(await htmlDuDocument(octets));
  const marge = Math.max(10, donnees.marge);

  return {
    partie: "Corps du document",
    resume: `${rapport.elements} élément(s) au fil, ${rapport.tableaux} tableau(x)`,
    canevas: {
      largeur: A4.largeur,
      hauteur: A4.hauteur,
      blocs: [
        {
          id: "docx-flux",
          type: "FLUX",
          x: marge,
          y: marge,
          largeur: A4.largeur - marge * 2,
          hauteur: A4.hauteur - marge * 2,
          plan: 0,
          nom: "Corps du document",
          elements,
          style: { ...STYLE_TEXTE_DEFAUT, taille: 10, interligne: 1.35 },
          encadrement: { ...ENCADREMENT_DEFAUT },
          marge: 0,
          couleurTitre: "#2c4a7c",
          fondEntete: "#15181d",
          couleurEntete: "#ffffff",
          bordureTableau: "#d9d9d9",
        },
      ],
    },
    images: [],
    rapport,
  };
}

/** Dépose une image et rend sa référence, telle que les blocs l'attendent. */
async function deposer(
  nom: string,
  octets: Uint8Array,
  type: "png" | "jpeg",
  origine: string
) {
  const { fichierId } = await enregistrerFichier(nom, octets, {
    usage: "image-modele",
    origine: `import:${origine}`,
  });
  return { fichierId, nom, type };
}

async function depuisClasseur(
  octets: Uint8Array,
  donnees: Demande,
  nomFichier: string
): Promise<Importe> {
  const classeur = await ouvrirClasseur(octets);
  const feuille = donnees.partie
    ? classeur.getWorksheet(donnees.partie)
    : classeur.worksheets[0];
  if (!feuille) {
    throw new Error(`Feuille « ${donnees.partie} » introuvable dans ce classeur.`);
  }

  const lues = imagesDeLaFeuille(classeur, feuille);
  const deposees = [];
  const ancrages: ImageTableur[] = [];

  for (const image of lues) {
    const depot = await deposer(image.nom, image.octets, image.type, nomFichier);
    deposees.push(depot);
    ancrages.push({
      ligne: image.ligne,
      colonne: image.colonne,
      largeurPx: image.largeurPx,
      hauteurPx: image.hauteurPx,
      fichierId: String(depot.fichierId),
      nomFichier: image.nom,
    });
  }

  const normalisee = lireFeuille(feuille, ancrages);
  const canevas = feuilleVersCanevas(normalisee, { marge: donnees.marge });
  const rapport = rapporterImport(normalisee, canevas);
  return {
    partie: feuille.name,
    resume: `${rapport.blocs} bloc(s), ${rapport.images} image(s)`,
    canevas,
    images: deposees,
    rapport,
  };
}

async function depuisPresentation(
  octets: Uint8Array,
  donnees: Demande,
  nomFichier: string
): Promise<Importe> {
  const archive = ouvrirPresentation(octets);
  const numero = Number(donnees.partie ?? 1);
  if (!Number.isFinite(numero) || numero < 1) {
    throw new Error("Choisissez une diapositive à importer.");
  }

  const { diapositive, images } = lireDiapositive(archive, numero);

  // Les formes transportent l'identifiant de relation (« rId2 ») ; une fois
  // le fichier déposé, on le remplace par l'identifiant du stockage.
  const deposees = [];
  const parRelation = new Map<string, string>();
  for (const image of images) {
    const depot = await deposer(image.nom, image.octets, image.type, nomFichier);
    deposees.push(depot);
    parRelation.set(image.relation, String(depot.fichierId));
  }
  for (const forme of diapositive.formes) {
    if (forme.fichierId) {
      forme.fichierId = parRelation.get(forme.fichierId) ?? undefined;
    }
  }

  const canevas = diapositiveVersCanevas(diapositive, {
    // Une diapositive 16/9 posée telle quelle sur un A4 portrait déborderait
    // à droite et laisserait les deux tiers du bas vides.
    ...(donnees.ajusterALaPage
      ? { page: { largeur: A4.largeur, hauteur: A4.hauteur }, ajusterALaPage: true }
      : {}),
  });

  const rapport = rapporterPresentation(diapositive, canevas);
  return {
    partie: diapositive.nom,
    resume: `${rapport.blocs} bloc(s), ${rapport.images} image(s)`,
    canevas,
    images: deposees,
    rapport,
  };
}
