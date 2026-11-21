import type { ElementFlux } from "./flux-document";

/**
 * Conversion d'un document Word en éléments de flux — logique pure, testée.
 *
 * Un `.docx` n'a pas de coordonnées : c'est un texte qui coule, avec des
 * titres, des paragraphes, des listes et des tableaux. Le transposer en blocs
 * posés au millimètre serait un contresens — il va dans un **bloc en flux**,
 * qui est exactement de la même nature.
 *
 * C'est pourquoi l'import Word, que j'avais d'abord annoncé comme « le plus
 * difficile », est en réalité le plus direct des trois : il n'y a aucune
 * géométrie à deviner, parce qu'il n'y en a pas à reprendre.
 *
 * Ce fichier reçoit du **HTML** — ce que `mammoth` sait produire d'un `.docx`
 * — et le réduit aux éléments de flux. Il ne connaît ni Word ni mammoth, et
 * sert donc tel quel à tout contenu riche : un courriel collé, un texte
 * rédigé ailleurs.
 */

export type RapportTexte = {
  elements: number;
  titres: number;
  tableaux: number;
  listes: number;
  /** Images rencontrées : un bloc en flux n'en place pas. */
  imagesIgnorees: number;
};

/** Entités HTML courantes. Décoder tout le jeu serait inutile ici. */
const ENTITES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&eacute;": "é",
  "&egrave;": "è",
  "&agrave;": "à",
  "&ccedil;": "ç",
  "&ocirc;": "ô",
  "&ucirc;": "û",
  "&icirc;": "î",
  "&euro;": "€",
  "&laquo;": "«",
  "&raquo;": "»",
  "&hellip;": "…",
  "&mdash;": "—",
  "&ndash;": "–",
};

/** Retire les balises et décode les entités d'un fragment. */
export function texteBrut(html: string): string {
  let texte = html
    // Un saut de ligne forcé est un vrai saut, pas une espace.
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  for (const [entite, caractere] of Object.entries(ENTITES)) {
    texte = texte.split(entite).join(caractere);
  }
  // Les codes numériques restants, décodés d'un coup.
  texte = texte.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(Number(code))
  );
  return texte
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/** Contenu des balises d'un nom donné, dans l'ordre. */
function contenus(html: string, balise: string): string[] {
  const motif = new RegExp(`<${balise}\\b[^>]*>([\\s\\S]*?)</${balise}>`, "gi");
  return [...html.matchAll(motif)].map((trouve) => trouve[1]);
}

/**
 * Réduit du HTML en éléments de flux.
 *
 * Les blocs sont relevés **dans l'ordre du document** : un titre suivi d'une
 * liste puis d'un tableau doit se retrouver dans cet ordre, sinon un
 * procès-verbal devient illisible.
 */
export function htmlVersFlux(html: string): {
  elements: ElementFlux[];
  rapport: RapportTexte;
} {
  const elements: ElementFlux[] = [];
  let imagesIgnorees = 0;

  // Un seul balayage, qui reconnaît les blocs là où ils se présentent.
  const motif =
    /<(h[1-6]|p|ul|ol|table)\b[^>]*>([\s\S]*?)<\/\1>|<img\b[^>]*>/gi;

  for (const trouve of html.matchAll(motif)) {
    const balise = trouve[1]?.toLowerCase();
    const interieur = trouve[2] ?? "";

    if (!balise) {
      // Une image : un bloc en flux ne place pas d'illustration. On le compte
      // pour le dire, plutôt que de la faire disparaître en silence.
      imagesIgnorees += 1;
      continue;
    }

    if (balise.startsWith("h")) {
      const texte = texteBrut(interieur);
      if (!texte) continue;
      // Word numérote jusqu'à h6 ; le flux n'a que trois niveaux de titre,
      // au-delà la hiérarchie ne se voit plus à l'œil.
      const niveau = Math.min(3, Number(balise[1]) || 1) as 1 | 2 | 3;
      elements.push({ type: "TITRE", niveau, texte });
      continue;
    }

    if (balise === "p") {
      const texte = texteBrut(interieur);
      // Word sème des paragraphes vides en guise d'espacement : on les rend
      // comme tels plutôt que de les jeter, l'aération fait partie du modèle.
      elements.push(
        texte
          ? { type: "PARAGRAPHE", texte }
          : { type: "ESPACE", hauteur: 3 }
      );
      continue;
    }

    if (balise === "ul" || balise === "ol") {
      const items = contenus(interieur, "li")
        .map(texteBrut)
        .filter(Boolean);
      if (items.length) {
        elements.push({ type: "LISTE", ordonnee: balise === "ol", items });
      }
      continue;
    }

    // --- Tableau
    const rangees = contenus(interieur, "tr").map((rangee) => {
      const cellules = [
        ...[...rangee.matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((c) => ({
          texte: texteBrut(c[2]),
          entete: c[1].toLowerCase() === "th",
        })),
      ];
      return cellules;
    });
    if (!rangees.length) continue;

    // Une première rangée faite de `th`, ou mise en gras par Word, vaut
    // en-tête : c'est ainsi qu'un tableau se lit.
    //
    // Sauf s'il n'y a qu'une rangée : un tableau d'une seule ligne n'a pas
    // d'en-tête, c'est une ligne de contenu. Word emploie couramment cette
    // forme pour un encadré — une clause d'engagement à signer, un cartouche
    // — et la prendre pour un en-tête vidait le tableau de son corps.
    const premiere = rangees[0];
    const aEntete = rangees.length > 1 && premiere.some((c) => c.entete);
    elements.push({
      type: "TABLEAU",
      entetes: aEntete ? premiere.map((c) => c.texte) : [],
      lignes: (aEntete ? rangees.slice(1) : rangees).map((r) =>
        r.map((c) => c.texte)
      ),
    });
  }

  return {
    elements,
    rapport: {
      elements: elements.length,
      titres: elements.filter((e) => e.type === "TITRE").length,
      tableaux: elements.filter((e) => e.type === "TABLEAU").length,
      listes: elements.filter((e) => e.type === "LISTE").length,
      imagesIgnorees,
    },
  };
}
