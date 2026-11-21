import { unzipSync } from "fflate";
import { XMLParser } from "fast-xml-parser";
import {
  centiemesEnPoints,
  emuEnMm,
  type DiapositivePresentation,
  type FormePresentation,
  type PassagePresentation,
} from "./import-presentation";
import type { Alignement, AlignementVertical } from "./canevas";

/**
 * Lecture d'un fichier `.pptx` — la seule partie qui connaisse OOXML.
 *
 * Un `.pptx` est une archive zip de fichiers XML. Il n'existe pas de
 * bibliothèque JavaScript de lecture qui fasse autorité, mais ce dont on a
 * besoin tient en peu de chose : pour chaque forme, sa position, sa taille,
 * son texte et sa mise en forme. On dézippe et on lit, plutôt que de traîner
 * une dépendance lourde pour quatre balises.
 *
 * Comme pour le tableur, cette lecture ne fait que **normaliser** : elle rend
 * une `DiapositivePresentation` que `import-presentation.ts` transpose
 * ensuite en blocs.
 *
 * Ce qui n'est pas lu, et qu'il faut savoir : les **thèmes**. Une couleur
 * déclarée par référence au thème (`schemeClr`) n'est pas résolue — on ne la
 * reprend pas plutôt que d'inventer une teinte. Les couleurs explicites
 * (`srgbClr`), de loin les plus fréquentes dans un modèle fait main, passent.
 */

type Noeud = Record<string, unknown>;

const lecteur = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  /*
   * Les espaces de bord comptent : OOXML découpe « Nom : Amicale » en deux
   * passages, « Nom : » et « Amicale ». Rognés, ils se recollent en
   * « Nom :Amicale ». PowerPoint pose d'ailleurs `xml:space="preserve"`
   * sur ces balises, preuve qu'il les tient pour significatifs.
   */
  trimValues: false,
  // Une diapositive à un seul paragraphe doit se lire comme celle qui en a
  // dix : sans cela, chaque accès devrait tester s'il tient un tableau.
  isArray: (nom) =>
    ["p:sp", "p:pic", "p:graphicFrame", "a:p", "a:r", "a:br"].includes(nom),
});

/** Descend une suite de clés, en rendant `undefined` dès que le chemin casse. */
function chemin(racine: unknown, ...cles: string[]): unknown {
  let courant = racine;
  for (const cle of cles) {
    if (!courant || typeof courant !== "object") return undefined;
    courant = (courant as Noeud)[cle];
  }
  return courant;
}

function nombre(valeur: unknown, defaut = 0): number {
  const lu = Number(valeur);
  return Number.isFinite(lu) ? lu : defaut;
}

/** Couleur OOXML explicite → `#rrggbb`. Les couleurs de thème sont ignorées. */
function couleurDe(parent: unknown): string | undefined {
  const valeur = chemin(parent, "a:solidFill", "a:srgbClr", "@val");
  if (typeof valeur !== "string" || !/^[0-9a-fA-F]{6}$/.test(valeur)) {
    return undefined;
  }
  return `#${valeur.toLowerCase()}`;
}

const ALIGNEMENTS: Record<string, Alignement> = {
  l: "gauche",
  ctr: "centre",
  r: "droite",
  just: "gauche",
};

const ANCRAGES: Record<string, AlignementVertical> = {
  t: "haut",
  ctr: "milieu",
  b: "bas",
};

/** Passages de texte d'une forme, mise en forme comprise. */
function passagesDe(corps: unknown): {
  passages: PassagePresentation[];
  alignement?: Alignement;
} {
  const paragraphes = (chemin(corps, "a:p") as unknown[] | undefined) ?? [];
  const passages: PassagePresentation[] = [];
  let alignement: Alignement | undefined;

  paragraphes.forEach((paragraphe, index) => {
    if (index > 0) passages.push({ texte: "\n" });

    const algn = chemin(paragraphe, "a:pPr", "@algn");
    if (typeof algn === "string" && ALIGNEMENTS[algn] && !alignement) {
      alignement = ALIGNEMENTS[algn];
    }

    const runs = (chemin(paragraphe, "a:r") as unknown[] | undefined) ?? [];
    for (const run of runs) {
      const brut = chemin(run, "a:t");
      // Un texte purement numérique est lu comme un nombre par le parseur.
      const texte =
        typeof brut === "string" || typeof brut === "number" ? String(brut) : "";
      if (!texte) continue;

      const props = chemin(run, "a:rPr");
      const taille = chemin(props, "@sz");
      passages.push({
        texte,
        gras: String(chemin(props, "@b") ?? "0") === "1",
        italique: String(chemin(props, "@i") ?? "0") === "1",
        taille: taille !== undefined ? centiemesEnPoints(nombre(taille)) : undefined,
        couleur: couleurDe(props),
      });
    }
  });

  return { passages, alignement };
}

/** Géométrie d'une forme. Absente, la forme est posée par un gabarit : on passe. */
function geometrieDe(proprietes: unknown): {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  rotation: number;
} | null {
  const xfrm = chemin(proprietes, "a:xfrm");
  if (!xfrm) return null;
  const off = chemin(xfrm, "a:off");
  const ext = chemin(xfrm, "a:ext");
  if (!off || !ext) return null;

  return {
    x: emuEnMm(nombre(chemin(off, "@x"))),
    y: emuEnMm(nombre(chemin(off, "@y"))),
    largeur: emuEnMm(nombre(chemin(ext, "@cx"))),
    hauteur: emuEnMm(nombre(chemin(ext, "@cy"))),
    // La rotation d'OOXML est en 60 000e de degré.
    rotation: nombre(chemin(xfrm, "@rot")) / 60000,
  };
}

export type ImagePptx = {
  nom: string;
  type: "png" | "jpeg";
  octets: Uint8Array;
  /** Identifiant de relation (`rId2`), pour relier la forme à son fichier. */
  relation: string;
};

export type DiapositiveLue = {
  diapositive: DiapositivePresentation;
  images: ImagePptx[];
};

export type DiapositiveDisponible = { numero: number; formes: number };

type Archive = Record<string, Uint8Array>;

function texteDe(archive: Archive, chemin: string): string | null {
  const octets = archive[chemin];
  return octets ? new TextDecoder().decode(octets) : null;
}

export function ouvrirPresentation(octets: Uint8Array): Archive {
  try {
    return unzipSync(octets);
  } catch {
    throw new Error(
      "Fichier illisible : ce n'est pas un .pptx valide. Depuis Google Slides, « Fichier → Télécharger → Microsoft PowerPoint »."
    );
  }
}

/** Chemins des diapositives, dans l'ordre. */
function cheminsDiapositives(archive: Archive): string[] {
  return Object.keys(archive)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const numero = (f: string) => Number(f.match(/slide(\d+)\.xml$/)![1]);
      return numero(a) - numero(b);
    });
}

export function diapositivesDisponibles(
  archive: Archive
): DiapositiveDisponible[] {
  return cheminsDiapositives(archive).map((fichier, index) => {
    const xml = texteDe(archive, fichier);
    const arbre = xml ? lecteur.parse(xml) : null;
    const arbreFormes = chemin(arbre, "p:sld", "p:cSld", "p:spTree");
    const formes = (chemin(arbreFormes, "p:sp") as unknown[] | undefined) ?? [];
    const images = (chemin(arbreFormes, "p:pic") as unknown[] | undefined) ?? [];
    // Les tableaux comptent aussi : annoncer « 3 formes » pour une
    // diapositive qui en porte quatre fait douter de ce qui sera importé.
    const cadres =
      (chemin(arbreFormes, "p:graphicFrame") as unknown[] | undefined) ?? [];
    return {
      numero: index + 1,
      formes: formes.length + images.length + cadres.length,
    };
  });
}

/** Dimensions de la diapositive, déclarées une fois pour la présentation. */
function tailleDiapositive(archive: Archive): { largeur: number; hauteur: number } {
  const xml = texteDe(archive, "ppt/presentation.xml");
  const taille = xml
    ? chemin(lecteur.parse(xml), "p:presentation", "p:sldSz")
    : undefined;
  return {
    // 254 × 142,9 mm : le 16/9 par défaut de PowerPoint.
    largeur: emuEnMm(nombre(chemin(taille, "@cx"), 9144000)),
    hauteur: emuEnMm(nombre(chemin(taille, "@cy"), 5143500)),
  };
}

/** Relations d'une diapositive : `rId2` → `../media/image1.png`. */
function relationsDe(archive: Archive, numero: number): Record<string, string> {
  const xml = texteDe(archive, `ppt/slides/_rels/slide${numero}.xml.rels`);
  if (!xml) return {};
  const brut = chemin(lecteur.parse(xml), "Relationships", "Relationship");
  const liste = Array.isArray(brut) ? brut : brut ? [brut] : [];
  const relations: Record<string, string> = {};
  for (const relation of liste) {
    const id = chemin(relation, "@Id");
    const cible = chemin(relation, "@Target");
    if (typeof id === "string" && typeof cible === "string") {
      relations[id] = cible.replace(/^\.\.\//, "ppt/");
    }
  }
  return relations;
}

/** Toutes les occurrences d'une clé, qu'elle soit unique ou répétée. */
function liste(valeur: unknown): unknown[] {
  if (valeur === undefined || valeur === null) return [];
  return Array.isArray(valeur) ? valeur : [valeur];
}

/** Texte d'une cellule : ses paragraphes mis bout à bout. */
function texteDeLaCellule(cellule: unknown): string {
  return liste(chemin(cellule, "a:txBody", "a:p"))
    .map((paragraphe) =>
      liste(chemin(paragraphe, "a:r"))
        .map((passage) => String(chemin(passage, "a:t") ?? ""))
        .join("")
    )
    .join("\n")
    .trim();
}

/**
 * Tableau porté par un `p:graphicFrame`, s'il en porte un.
 *
 * Un tableau PowerPoint n'est ni une forme (`p:sp`) ni une image (`p:pic`) :
 * sans ce passage, la grille d'un reçu ou d'une facture disparaissait de
 * l'import sans que rien ne le signale.
 */
function tableauDuCadre(
  cadre: unknown
): { parts: number[]; rangees: string[][] } | null {
  const table = chemin(cadre, "a:graphic", "a:graphicData", "a:tbl");
  if (!table) return null;

  const largeurs = liste(chemin(table, "a:tblGrid", "a:gridCol")).map((colonne) =>
    Math.max(1, nombre(chemin(colonne, "@w"), 1))
  );
  // Les colonnes sont déclarées en EMU. Le bloc du canevas n'en veut que la
  // proportion : laisser « 2438400 » dans le réglage d'une colonne serait
  // illisible là où « 1 » dit la même chose.
  const plusEtroite = Math.min(...largeurs);
  const parts = largeurs.map(
    (w) => Math.round((w / plusEtroite) * 100) / 100
  );
  const rangees = liste(chemin(table, "a:tr")).map((rangee) =>
    liste(chemin(rangee, "a:tc")).map(texteDeLaCellule)
  );
  if (!parts.length || !rangees.length) return null;

  // Une rangée courte laisserait des colonnes sans cellule : on complète,
  // le bloc du canevas attend une grille régulière.
  return {
    parts,
    rangees: rangees.map((r) =>
      parts.map((_, i) => r[i] ?? "")
    ),
  };
}

/**
 * Lit une diapositive. Les images sont rendues avec leurs octets et leur
 * identifiant de relation ; c'est à l'appelant de les déposer et de
 * renseigner les `fichierId` des formes correspondantes.
 */
export function lireDiapositive(
  archive: Archive,
  numero: number
): DiapositiveLue {
  const fichier = `ppt/slides/slide${numero}.xml`;
  const xml = texteDe(archive, fichier);
  if (!xml) throw new Error(`Diapositive ${numero} introuvable.`);

  const arbre = lecteur.parse(xml);
  const arbreFormes = chemin(arbre, "p:sld", "p:cSld", "p:spTree");
  const relations = relationsDe(archive, numero);
  const taille = tailleDiapositive(archive);

  const formes: FormePresentation[] = [];
  const images: ImagePptx[] = [];
  let rang = 0;

  // --- Formes porteuses de texte ou d'aplat
  for (const forme of (chemin(arbreFormes, "p:sp") as unknown[] | undefined) ?? []) {
    const proprietes = chemin(forme, "p:spPr");
    const geometrie = geometrieDe(proprietes);
    if (!geometrie) continue;

    const corps = chemin(forme, "p:txBody");
    const { passages, alignement } = passagesDe(corps);
    const ancrage = chemin(corps, "a:bodyPr", "@anchor");

    formes.push({
      ...geometrie,
      rang: rang++,
      nom: String(chemin(forme, "p:nvSpPr", "p:cNvPr", "@name") ?? "") || undefined,
      passages,
      alignement,
      alignementVertical:
        typeof ancrage === "string" ? ANCRAGES[ancrage] : undefined,
      fond: couleurDe(proprietes),
      contour: couleurDe(chemin(proprietes, "a:ln")),
      epaisseurContour: chemin(proprietes, "a:ln", "@w")
        ? emuEnMm(nombre(chemin(proprietes, "a:ln", "@w")))
        : undefined,
    });
  }

  // --- Tableaux (`p:graphicFrame`)
  for (const cadre of (chemin(arbreFormes, "p:graphicFrame") as
    | unknown[]
    | undefined) ?? []) {
    const tableau = tableauDuCadre(cadre);
    if (!tableau) continue;

    const position = chemin(cadre, "p:xfrm");
    const depart = chemin(position, "a:off");
    const etendue = chemin(position, "a:ext");
    if (!depart || !etendue) continue;

    formes.push({
      x: emuEnMm(nombre(chemin(depart, "@x"))),
      y: emuEnMm(nombre(chemin(depart, "@y"))),
      largeur: emuEnMm(nombre(chemin(etendue, "@cx"))),
      hauteur: emuEnMm(nombre(chemin(etendue, "@cy"))),
      rang: rang++,
      nom:
        String(chemin(cadre, "p:nvGraphicFramePr", "p:cNvPr", "@name") ?? "") ||
        undefined,
      passages: [],
      tableau,
    });
  }

  // --- Images
  for (const image of (chemin(arbreFormes, "p:pic") as unknown[] | undefined) ?? []) {
    const geometrie = geometrieDe(chemin(image, "p:spPr"));
    if (!geometrie) continue;

    const relation = chemin(image, "p:blipFill", "a:blip", "@r:embed");
    if (typeof relation !== "string") continue;
    const cible = relations[relation];
    const octets = cible ? archive[cible] : undefined;
    if (!octets) continue;

    const extension = (cible.split(".").pop() ?? "png").toLowerCase();
    if (!["png", "jpg", "jpeg"].includes(extension)) {
      // GIF, EMF, SVG : pdf-lib ne sait pas les embarquer.
      continue;
    }

    const nom = cible.split("/").pop() ?? `${relation}.${extension}`;
    if (!images.some((i) => i.relation === relation)) {
      images.push({
        nom,
        type: extension === "png" ? "png" : "jpeg",
        octets,
        relation,
      });
    }

    formes.push({
      ...geometrie,
      rang: rang++,
      nom: String(chemin(image, "p:nvPicPr", "p:cNvPr", "@name") ?? "") || undefined,
      passages: [],
      // Renseigné par l'appelant après dépôt ; on transporte la relation.
      fichierId: relation,
      nomFichier: nom,
    });
  }

  return {
    diapositive: {
      nom: `Diapositive ${numero}`,
      largeur: taille.largeur,
      hauteur: taille.hauteur,
      formes,
    },
    images,
  };
}
