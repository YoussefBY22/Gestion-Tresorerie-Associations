import type { Alignement, StyleTexte } from "./canevas";

/**
 * Mise en page d'un contenu qui coule — logique pure, testée.
 *
 * Le canevas pose des blocs à une place choisie : c'est ce qu'il faut à un
 * reçu, dont la forme est imposée. Un procès-verbal ou un contrat, lui, n'a
 * pas de place pour chaque phrase — il a des titres, des paragraphes, des
 * listes et des tableaux qui s'enchaînent, et dont la longueur varie d'un
 * document à l'autre. Les positionner au millimètre serait absurde.
 *
 * D'où ce bloc à part : on lui donne un cadre, il y fait couler son contenu.
 * C'est aussi la forme qu'a un fichier Word, et donc ce qui rendra son import
 * possible.
 *
 * **Pourquoi un mesureur injecté.** Savoir où couper une ligne demande de
 * connaître la largeur du texte, donc la police — qui vit dans pdf-lib. Au
 * lieu de rendre cette mise en page impure, on lui passe une fonction de
 * mesure. Toute la logique de composition reste ainsi testable sans PDF, avec
 * un mesureur feint.
 */

/** Largeur d'un texte en millimètres, à une taille et une graisse données. */
export type MesureTexte = (
  texte: string,
  taille: number,
  gras: boolean
) => number;

export type ElementFlux =
  | { type: "TITRE"; niveau: 1 | 2 | 3; texte: string }
  | { type: "PARAGRAPHE"; texte: string; alignement?: Alignement }
  | { type: "LISTE"; ordonnee: boolean; items: string[] }
  | { type: "TABLEAU"; entetes: string[]; lignes: string[][] }
  | { type: "ESPACE"; hauteur: number }
  | { type: "FILET" };

/** Ce que le rendu n'a plus qu'à dessiner, tout étant déjà placé. */
export type OperationFlux =
  | {
      type: "TEXTE";
      texte: string;
      x: number;
      y: number;
      largeur: number;
      taille: number;
      gras: boolean;
      italique: boolean;
      couleur: string;
      alignement: Alignement;
    }
  | {
      type: "CELLULE";
      texte: string;
      x: number;
      y: number;
      largeur: number;
      hauteur: number;
      taille: number;
      gras: boolean;
      couleur: string;
      alignement: Alignement;
      fond: string;
      bordure: string;
    }
  | { type: "FILET"; x: number; y: number; largeur: number; couleur: string };

export type StyleFlux = {
  /** Style du corps de texte. */
  corps: StyleTexte;
  /** Couleur des titres et des filets. */
  couleurTitre: string;
  /** Fond de la ligne d'en-tête des tableaux. */
  fondEntete: string;
  couleurEntete: string;
  /** Filets des tableaux ; vide pour aucun. */
  bordureTableau: string;
};

export type OptionsFlux = {
  /** Largeur utile, marges déjà retirées, en millimètres. */
  largeur: number;
  /** Hauteur utile ; ce qui dépasse est signalé, jamais dessiné. */
  hauteur: number;
  style: StyleFlux;
  mesurer: MesureTexte;
};

export type FluxCompose = {
  operations: OperationFlux[];
  /** Hauteur réellement occupée, en millimètres. */
  hauteurUtilisee: number;
  /**
   * Nombre d'éléments qui n'ont pas trouvé leur place. Un contrat tronqué
   * sans le dire serait pire qu'un contrat qui déborde : l'appelant le
   * signale.
   */
  elementsCoupes: number;
};

/** Un point typographique vaut 0,3528 mm. */
const MM_PAR_POINT = 25.4 / 72;

/** Facteur de taille des titres, par niveau. */
const TAILLE_TITRE: Record<1 | 2 | 3, number> = { 1: 1.7, 2: 1.35, 3: 1.15 };
/** Espace avant et après un titre, en multiples de sa hauteur de ligne. */
const AIR_TITRE = { avant: 0.6, apres: 0.25 };
/** Retrait d'une puce, en millimètres. */
const RETRAIT_LISTE = 5;

function hauteurLigne(taille: number, interligne: number): number {
  return taille * MM_PAR_POINT * interligne;
}

/**
 * Découpe un texte en lignes qui tiennent dans `largeur`.
 *
 * Un mot plus long que la largeur disponible occupe sa ligne seul plutôt que
 * de faire boucler la découpe — cela arrive sur une URL ou une référence.
 */
export function replierEnLignes(
  texte: string,
  largeur: number,
  taille: number,
  gras: boolean,
  mesurer: MesureTexte
): string[] {
  const lignes: string[] = [];
  for (const paragraphe of texte.split("\n")) {
    let courante = "";
    for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (courante && mesurer(essai, taille, gras) > largeur) {
        lignes.push(courante);
        courante = mot;
      } else {
        courante = essai;
      }
    }
    lignes.push(courante);
  }
  return lignes;
}

/**
 * Compose le contenu dans le cadre.
 *
 * Les coordonnées rendues sont **relatives au coin haut-gauche du cadre
 * utile** : c'est au rendu d'y ajouter la position du bloc et de retourner
 * l'axe vertical. La composition n'a pas à connaître la page.
 */
export function composerFlux(
  elements: ElementFlux[],
  options: OptionsFlux
): FluxCompose {
  const { largeur, hauteur, style, mesurer } = options;
  const corps = style.corps;
  const operations: OperationFlux[] = [];
  let y = 0;
  let coupes = 0;

  /** Reste-t-il la place demandée ? Sinon on arrête, on ne rogne pas. */
  const tient = (besoin: number) => y + besoin <= hauteur + 0.001;

  /**
   * Avance d'un blanc de séparation, sans jamais sortir du cadre.
   *
   * L'air après un élément ne sépare que du **suivant** : s'il n'y a plus de
   * place, il ne sépare de rien. L'ajouter quand même ferait annoncer une
   * hauteur occupée supérieure au cadre — rien ne dépasserait à l'écran, mais
   * la mesure mentirait, et le débordement ne se verrait plus.
   */
  const respirer = (blanc: number) => {
    y = Math.min(hauteur, y + blanc);
  };

  const poserLignes = (
    texte: string,
    taille: number,
    gras: boolean,
    italique: boolean,
    couleur: string,
    alignement: Alignement,
    retrait = 0
  ): boolean => {
    const hLigne = hauteurLigne(taille, corps.interligne);
    const lignes = replierEnLignes(
      texte,
      largeur - retrait,
      taille,
      gras,
      mesurer
    );
    for (const ligne of lignes) {
      if (!tient(hLigne)) return false;
      operations.push({
        type: "TEXTE",
        texte: ligne,
        x: retrait,
        y,
        largeur: largeur - retrait,
        taille,
        gras,
        italique,
        couleur,
        alignement,
      });
      y += hLigne;
    }
    return true;
  };

  for (const element of elements) {
    const avant = y;

    if (element.type === "ESPACE") {
      if (!tient(element.hauteur)) {
        coupes += 1;
        continue;
      }
      y += element.hauteur;
      continue;
    }

    if (element.type === "FILET") {
      const air = hauteurLigne(corps.taille, corps.interligne) * 0.5;
      if (!tient(air * 2)) {
        coupes += 1;
        continue;
      }
      y += air;
      operations.push({
        type: "FILET",
        x: 0,
        y,
        largeur,
        couleur: style.couleurTitre,
      });
      y += air;
      continue;
    }

    if (element.type === "TITRE") {
      const taille = corps.taille * TAILLE_TITRE[element.niveau];
      const hLigne = hauteurLigne(taille, corps.interligne);
      const air = hLigne * AIR_TITRE.avant;
      // L'air au-dessus d'un titre ne se met pas en tête de bloc : un
      // document ne commence pas par un blanc.
      const airEffectif = operations.length ? air : 0;

      if (!tient(airEffectif + hLigne)) {
        coupes += 1;
        continue;
      }
      y += airEffectif;
      const pose = poserLignes(
        element.texte,
        taille,
        true,
        false,
        style.couleurTitre,
        corps.alignement
      );
      if (!pose) {
        y = avant;
        coupes += 1;
        continue;
      }
      respirer(hLigne * AIR_TITRE.apres);
      continue;
    }

    if (element.type === "PARAGRAPHE") {
      const pose = poserLignes(
        element.texte,
        corps.taille,
        corps.gras,
        corps.italique,
        corps.couleur,
        element.alignement ?? corps.alignement
      );
      if (!pose) {
        y = avant;
        coupes += 1;
        continue;
      }
      respirer(hauteurLigne(corps.taille, corps.interligne) * 0.25);
      continue;
    }

    if (element.type === "LISTE") {
      let complete = true;
      element.items.forEach((item, index) => {
        if (!complete) return;
        const puce = element.ordonnee ? `${index + 1}.` : "•";
        const hLigne = hauteurLigne(corps.taille, corps.interligne);
        if (!tient(hLigne)) {
          complete = false;
          return;
        }
        // La puce est posée à part du texte : sans cela, un item qui se
        // replie sur deux lignes ramènerait la seconde sous la puce.
        operations.push({
          type: "TEXTE",
          texte: puce,
          x: 0,
          y,
          largeur: RETRAIT_LISTE,
          taille: corps.taille,
          gras: false,
          italique: false,
          couleur: corps.couleur,
          alignement: "gauche",
        });
        complete = poserLignes(
          item,
          corps.taille,
          corps.gras,
          corps.italique,
          corps.couleur,
          "gauche",
          RETRAIT_LISTE
        );
      });
      if (!complete) coupes += 1;
      respirer(hauteurLigne(corps.taille, corps.interligne) * 0.25);
      continue;
    }

    // --- Tableau
    const colonnes = Math.max(
      element.entetes.length,
      ...element.lignes.map((l) => l.length),
      1
    );
    const largeurCellule = largeur / colonnes;
    const taille = corps.taille;
    const hLigne = hauteurLigne(taille, corps.interligne);

    /** Hauteur d'une rangée : celle de sa cellule la plus bavarde. */
    const hauteurRangee = (cellules: string[], gras: boolean) =>
      Math.max(
        1,
        ...cellules.map(
          (c) =>
            replierEnLignes(c, largeurCellule - 2, taille, gras, mesurer).length
        )
      ) * hLigne;

    const rangees: { cellules: string[]; entete: boolean }[] = [];
    if (element.entetes.length) {
      rangees.push({ cellules: element.entetes, entete: true });
    }
    for (const ligne of element.lignes) {
      rangees.push({ cellules: ligne, entete: false });
    }

    let tronque = false;
    for (const rangee of rangees) {
      const h = hauteurRangee(rangee.cellules, rangee.entete);
      if (!tient(h)) {
        tronque = true;
        break;
      }
      for (let c = 0; c < colonnes; c++) {
        operations.push({
          type: "CELLULE",
          texte: rangee.cellules[c] ?? "",
          x: c * largeurCellule,
          y,
          largeur: largeurCellule,
          hauteur: h,
          taille,
          gras: rangee.entete,
          couleur: rangee.entete ? style.couleurEntete : corps.couleur,
          alignement: rangee.entete ? "centre" : "gauche",
          fond: rangee.entete ? style.fondEntete : "",
          bordure: style.bordureTableau,
        });
      }
      y += h;
    }
    if (tronque) coupes += 1;
    respirer(hLigne * 0.25);
  }

  return { operations, hauteurUtilisee: y, elementsCoupes: coupes };
}

/**
 * Mesureur approché, pour estimer une hauteur sans police chargée.
 *
 * Sert à l'écran, où l'aperçu n'a pas accès aux métriques du PDF. 0,5 em par
 * caractère est l'ordre de grandeur d'une police proportionnelle — assez juste
 * pour juger d'un débordement, jamais pour un rendu définitif.
 */
export const mesureApprochee: MesureTexte = (texte, taille) =>
  texte.length * taille * MM_PAR_POINT * 0.5;


/* ------------------------------------------------------------------ */
/* Manipulation de la liste d'éléments                                 */
/* ------------------------------------------------------------------ */

/**
 * Opérations de l'éditeur sur un contenu au fil.
 *
 * Elles vivent ici, avec la composition, plutôt que dans le composant : un
 * déplacement d'élément se teste sans navigateur, et le secrétariat
 * réutilisera les mêmes.
 */

export function deplacerElement(
  elements: ElementFlux[],
  index: number,
  sens: "haut" | "bas"
): ElementFlux[] {
  const voisin = sens === "haut" ? index - 1 : index + 1;
  if (index < 0 || index >= elements.length) return elements;
  if (voisin < 0 || voisin >= elements.length) return elements;
  const copie = [...elements];
  [copie[index], copie[voisin]] = [copie[voisin], copie[index]];
  return copie;
}

export function retirerElement(
  elements: ElementFlux[],
  index: number
): ElementFlux[] {
  return elements.filter((_, i) => i !== index);
}

export function remplacerElement(
  elements: ElementFlux[],
  index: number,
  remplacant: ElementFlux
): ElementFlux[] {
  return elements.map((e, i) => (i === index ? remplacant : e));
}

/** Élément neuf d'un type donné, prêt à être rempli. */
export function elementVide(type: ElementFlux["type"]): ElementFlux {
  switch (type) {
    case "TITRE":
      return { type: "TITRE", niveau: 2, texte: "Titre" };
    case "PARAGRAPHE":
      return { type: "PARAGRAPHE", texte: "" };
    case "LISTE":
      return { type: "LISTE", ordonnee: false, items: [""] };
    case "TABLEAU":
      return {
        type: "TABLEAU",
        entetes: ["Colonne 1", "Colonne 2"],
        lignes: [["", ""]],
      };
    case "ESPACE":
      return { type: "ESPACE", hauteur: 5 };
    case "FILET":
      return { type: "FILET" };
  }
}

/** Libellé d'un élément dans la liste de l'éditeur. */
export function libelleElement(element: ElementFlux): string {
  switch (element.type) {
    case "TITRE":
      return `Titre ${element.niveau}`;
    case "PARAGRAPHE":
      return "Paragraphe";
    case "LISTE":
      return element.ordonnee ? "Liste numérotée" : "Liste à puces";
    case "TABLEAU":
      return `Tableau (${element.lignes.length} ligne(s))`;
    case "ESPACE":
      return `Espace (${element.hauteur} mm)`;
    case "FILET":
      return "Filet";
  }
}

/* ------------------------------------------------------------------ */
/* Saisie au clavier                                                   */
/* ------------------------------------------------------------------ */

/**
 * Les items d'une liste se saisissent **une par ligne**.
 *
 * Un champ par item encombrerait un panneau déjà étroit, et empêcherait de
 * coller une liste venue d'ailleurs — ce qui est le geste le plus courant.
 */
export function lignesVersItems(texte: string): string[] {
  const garnis = texte
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  // On garde une entrée vide quand tout est vide : une liste sans item
  // disparaîtrait de l'écran et on ne pourrait plus y taper.
  return garnis.length ? garnis : [""];
}

export function itemsVersLignes(items: string[]): string {
  return items.join("\n");
}

/**
 * Un tableau se saisit **une rangée par ligne, cellules séparées par `|`**.
 *
 * La première rangée vaut en-tête. C'est la convention la plus rapide à taper
 * et la seule qui permette de coller un tableau venu d'ailleurs ; ceux qui
 * demandent un réglage cellule par cellule se font avec un bloc tableau
 * posé, qui a son propre éditeur.
 */
export function texteVersTableau(texte: string): {
  entetes: string[];
  lignes: string[][];
} {
  const rangees = texte
    .split("\n")
    .map((ligne) => ligne.split("|").map((c) => c.trim()))
    .filter((cellules) => cellules.some(Boolean));
  if (!rangees.length) return { entetes: [], lignes: [] };
  return { entetes: rangees[0], lignes: rangees.slice(1) };
}

export function tableauVersTexte(tableau: {
  entetes: string[];
  lignes: string[][];
}): string {
  const rangees = tableau.entetes.length
    ? [tableau.entetes, ...tableau.lignes]
    : tableau.lignes;
  return rangees.map((r) => r.join(" | ")).join("\n");
}
